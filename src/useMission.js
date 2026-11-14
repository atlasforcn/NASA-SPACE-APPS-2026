import {
  reactive,
  shallowRef,
  computed,
  watch,
  onScopeDispose,
  nextTick,
} from "vue";
import L from "leaflet";
import C from "../core.mjs";
import S from "../skyline.mjs";
import P from "../planet.mjs";
import { asset, json } from "./asset";

export const missionKey = Symbol("mission");
export const fmt = (m) =>
  m >= 1000 ? (m / 1000).toFixed(2) + " km" : Math.round(m) + " m";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const typeLabels = {
  AA: "撞擊坑",
  MO: "山體",
  VA: "河谷",
  CM: "峽谷",
  PL: "低地平原",
  PM: "高原",
  FO: "槽溝",
  TE: "大陸地形",
  CH: "混沌地形",
  UN: "沙丘區",
};

// Each mounted application owns its state and resources. Leaflet and large grids stay non-reactive.
export function useMission() {
  const state = reactive({
    ready: false,
    loading: true,
    error: "",
    tab: "mission",
    panelOpen: true,
    regional: false,
    truth: { x: -1400, y: -820, heading: 45 },
    estimate: { x: -750, y: -1340, heading: 69 },
    travelled: 0,
    targets: [],
    destination: "",
    pickingTarget: false,
    pickingStart: false,
    straightStatus: "先選端點，再評估直線。",
    targetName: "",
    slope: 24,
    route: null,
    routeStatus: "選擇科學點並規劃路線",
    running: false,
    scenario: "good",
    viewYaw: 0,
    searching: false,
    continuousLocalization: true,
    localizationCount: 0,
    progress: "",
    status: "尚未定位",
    message: "完整 360° 模擬觀測；導航起始含里程偏差。",
    result: null,
    truthVisible: false,
    evaluation: "",
    bearing: "",
    layer: "none",
    optical: true,
    legend: "",
    units: [],
    source: "",
    warning: "正在讀取真實火星資料…",
    coords: "火星局部座標 · East / North",
    mapTitle: "Jezero",
    mapContext: "CTX 光學影像 · DEM 導航有效區",
    lat: 18.44,
    lng: 77.42,
    coordinateEditing: false,
    regionLoading: false,
    regionStatus: "全球數值高程於首次建立任務時載入。",
    elevation: "",
    query: "",
    type: "",
    entries: [],
    namesError: "",
    selected: null,
    pois: [],
    poi: null,
    drawMode: null,
    points: [],
    drawStatus: "從導航估計位置開始繪製，完成後檢查每一段。",
    stations: [],
    expedition: [],
    expeditionStatus: "",
    profileIndex: 0,
    profileInfo: "",
  });
  const dem = shallowRef(null),
    panorama = shallowRef(null),
    curve = shallowRef(null),
    profileCanvas = shallowRef(null);
  let map,
    snapshot,
    geology,
    missionStart,
    profileOptions,
    worker,
    job = 0,
    frame,
    disposed = false;
  let routeLayer,
    analysis,
    optical,
    estimateMarker,
    truthMarker,
    trail,
    preview,
    poiLayer,
    namesLayer,
    candidateLayer,
    stationLayer,
    expeditionLayer;
  let idealLayer;
  let bounds,
    planet,
    pendingPlanet,
    regionToken = 0,
    waypoint = 0,
    segmentProgress = 0,
    lastTime,
    lastDraw = 0,
    observation,
    lastScanDistance = -Infinity,
    stroke = false;
  const abort = new AbortController();
  const position = computed(() => {
    if (!dem.value) return "—";
    const p = C.localToLatLng(state.estimate.x, state.estimate.y);
    return `${p.lat.toFixed(5)}°N / ${p.lng.toFixed(5)}°E`;
  });
  const errorDistance = computed(() =>
    fmt(C.distance(state.truth, state.estimate)),
  );
  const matches = computed(() =>
    state.entries.filter(
      (p) =>
        (!state.query ||
          `${p.name} ${p.zh || ""}`
            .toLowerCase()
            .includes(state.query.trim().toLowerCase())) &&
        (!state.type || p.code === state.type),
    ),
  );
  const displayed = computed(() =>
    state.query || state.type
      ? matches.value
      : matches.value.filter((p) => p.featured),
  );
  const ll = (p) => {
    const v = C.localToLatLng(p.x, p.y);
    return [
      v.lat,
      state.regional
        ? dem.value.origin.lng +
          C.wrapRad((v.lng - dem.value.origin.lng) * C.DEG) / C.DEG
        : v.lng,
    ];
  };
  const local = (e) => C.latLngToLocal(e.latlng.lat, e.latlng.lng);
  const remove = (layer) => {
    if (layer && map) map.removeLayer(layer);
  };
  function inDem(p) {
    const v = C.latLngToLocal(p.lat, p.lng);
    return C.validDEMPoint(v.x, v.y);
  }
  function unitAt(p) {
    if (state.regional) return;
    return geology?.features.find((f) =>
      f.rings.reduce((hit, r) => {
        let inside = false;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const a = r[i],
            b = r[j];
          if (
            a[1] > p.y !== b[1] > p.y &&
            p.x < ((b[0] - a[0]) * (p.y - a[1])) / (b[1] - a[1]) + a[0]
          )
            inside = !inside;
        }
        return hit !== inside;
      }, false),
    );
  }
  function unitStyle(f) {
    return geology?.renderer.uniqueValueInfos?.find(
      (v) => v.value === String(f?.properties[geology.renderer.field1]),
    );
  }
  const unitLabel = (f) =>
    unitStyle(f)?.label ||
    String(f?.properties[geology?.renderer.field1] ?? "未知");
  function resetDrawing() {
    stopDrawing();
    state.points = [];
    remove(preview);
    preview = null;
    state.drawStatus = "從導航估計位置開始繪製，完成後檢查每一段。";
  }
  function stop() {
    state.running = false;
    cancelAnimationFrame(frame);
  }
  function cancel() {
    const active = !!worker;
    job++;
    worker?.terminate();
    worker = null;
    state.searching = false;
    if (active) {
      state.status = "搜尋已取消";
      state.progress = "搜尋已停止";
    }
  }
  function clearRoute() {
    remove(idealLayer);
    state.straightStatus = "請重新評估直線。";
    state.route = null;
    remove(routeLayer);
    routeLayer = null;
  }
  function reset(kind = state.scenario) {
    if (!dem.value) return;
    stop();
    cancel();
    resetDrawing();
    state.scenario = kind;
    state.truth = { ...missionStart, heading: 45 };
    state.estimate = {
      x: missionStart.x + 650,
      y: missionStart.y - 520,
      heading: 69,
    };
    state.travelled = 0;
    state.localizationCount = 0;
    lastScanDistance = -Infinity;
    clearRoute();
    state.result = null;
    observation = null;
    candidateLayer?.clearLayers();
    trail?.setLatLngs([]);
    state.status = "尚未定位";
    state.progress = "";
    state.evaluation = "";
    state.message =
      kind === "good"
        ? "完整 360° 模擬觀測；導航起始含里程偏差。"
        : "60° 視角並遮擋 55%；觀測不足時保留導航估計。";
    state.routeStatus = "選擇科學點並規劃路線";
    drawCurve();
    render();
  }
  function slopeValid() {
    const v = Number(state.slope);
    if (!Number.isFinite(v) || v < 1 || v > 45) {
      state.routeStatus = "坡度上限須介於 1–45°";
      return false;
    }
    C.setSlopeLimit(v);
    return true;
  }
  function installRoute(result) {
    clearRoute();
    state.route = result;
    state.profileIndex = -1;
    waypoint = 0;
    segmentProgress = 0;
    lastTime = null;
    routeLayer = L.layerGroup().addTo(map);
    for (let i = 1; i < result.path.length; i++)
      L.polyline([ll(result.path[i - 1]), ll(result.path[i])], {
        color: result.invalidSegments?.includes(i) ? "#ff736e" : "#8be4d0",
        weight: 4,
        dashArray: result.custom ? null : "6 5",
      }).addTo(routeLayer);
  }
  function plan() {
    stop();
    cancel();
    resetDrawing();
    if (!slopeValid()) return;
    const goal = state.targets.find((t) => t.id === state.destination);
    if (!goal) return;
    state.truth = { ...missionStart, heading: 45 };
    state.estimate = { ...missionStart, heading: 45 };
    state.travelled = 0;
    state.localizationCount = 0;
    lastScanDistance = -Infinity;
    trail.setLatLngs([ll(missionStart)]);
    const result = C.planPath(missionStart, goal);
    installRoute(result);
    const n = Math.max(1, Math.ceil(C.distance(missionStart, goal) / Math.max(15, dem.value.cellMeters / 3)));
    const points = Array.from({ length: n + 1 }, (_, i) => ({
      x: missionStart.x + (goal.x - missionStart.x) * i / n,
      y: missionStart.y + (goal.y - missionStart.y) * i / n,
    }));
    const direct = routeCheck(points);
    const unknown = points.some(p => C.risk(p.x, p.y).unknown || !C.validDEMPoint(p.x, p.y));
    idealLayer = L.layerGroup().addTo(map);
    points.slice(1).forEach((p, i) => L.polyline([ll(points[i]), ll(p)], {
      color: direct.invalidSegments.includes(i + 1) ? "#ff736e" : "#f4d19d",
      weight: 3, dashArray: "7 6", interactive: false,
    }).addTo(idealLayer));
    state.straightStatus = `理想直線 ${fmt(direct.length)} · 最大坡度 ${direct.maxSlope.toFixed(1)}° · ` +
      (direct.reachable ? "通過 DEM 檢查" : `${unknown ? "缺測或越界；" : ""}${direct.maxSlope > Number(state.slope) ? "超過坡度上限；" : ""}紅色路段不可通行，請沿青色建議路線繞行。`);
    state.continuousLocalization = true;
    render();
    state.routeStatus = result.reachable
      ? `沿線最大坡度 ${result.maxSlope.toFixed(1)}° · ${goal.unit} · 起點為使用者所選位置`
      : "估計位置與目標無可通行路線，請重新定位或調整門檻。";
  }
  function motion(ts) {
    if (!state.running) return;
    let budget =
      Math.min((ts - (lastTime || ts)) / 1000, 0.1) *
      (state.regional ? 10000 : 220);
    lastTime = ts;
    const path = state.route.path;
    while (budget > 0 && waypoint < path.length - 1) {
      const a = path[waypoint],
        b = path[waypoint + 1],
        length = C.distance(a, b),
        move = Math.min(budget, length - segmentProgress),
        yaw = C.bearingDeg(a, b);
      if (length === 0) {
        waypoint++;
        continue;
      }
      const dx = ((b.x - a.x) / length) * move,
        dy = ((b.y - a.y) / length) * move,
        next = { x: state.truth.x + dx, y: state.truth.y + dy };
      if (!C.segmentSafe(state.truth, next)) {
        stop();
        state.routeStatus = "模擬器地面碰撞檢查停止行進；請重新定位。";
        return;
      }
      state.truth = { ...next, heading: yaw };
      state.estimate = {
        x: state.estimate.x + dx + move * 0.025,
        y: state.estimate.y + dy - move * 0.015,
        heading: C.modDeg(yaw + state.travelled * 0.002),
      };
      state.travelled += move;
      segmentProgress += move;
      budget -= move;
      if (segmentProgress >= length - 1e-6) {
        waypoint++;
        segmentProgress = 0;
      }
    }
    if (waypoint >= path.length - 1) {
      stop();
      state.routeStatus = "導航估計已抵達路線終點；可掃描地平線檢查漂移。";
    } else {
      if (!state.searching) state.status = "里程推估／等待地平線更新";
      if (state.continuousLocalization && !state.searching &&
          state.travelled - lastScanDistance >= (state.regional ? 4000 : 250))
        scan(true);
      frame = requestAnimationFrame(motion);
    }
    trail.addLatLng(ll(state.estimate));
    if (ts - lastDraw > 180) {
      render();
      lastDraw = ts;
    }
  }
  function toggleMotion() {
    if (state.running) return stop();
    if (!state.route?.reachable) return;
    cancel();
    state.running = true;
    lastTime = null;
    if (state.continuousLocalization) scan(true);
    frame = requestAnimationFrame(motion);
  }
  function drift() {
    stop();
    cancel();
    resetDrawing();
    state.estimate = {
      x: state.truth.x + 650,
      y: state.truth.y - 520,
      heading: C.modDeg(state.truth.heading + 24),
    };
    clearRoute();
    state.status = "里程偏差已注入";
    render();
  }
  function scan(continuous = false) {
    // Click handlers pass an event; only explicit true enables moving capture.
    continuous = continuous === true;
    if (continuous) {
      if (state.searching || !state.running) return;
    } else {
      stop();
      cancel();
      resetDrawing();
    }
    if (!dem.value) return;
    lastScanDistance = state.travelled;
    const capturePose = { ...state.estimate };
    candidateLayer.clearLayers();
    state.result = null;
    observation = S.simulate(state.truth, {
      ...profileOptions,
      seed: 42,
      noise: 0.025,
      fov: state.scenario === "good" ? 360 : 60,
      occlusion: state.scenario === "good" ? 0 : 0.55,
    });
    drawCurve();
    const centre = { ...state.estimate },
      range = state.regional ? 16000 : 1600,
      searchBounds = {
        minX: Math.max(C.LIMIT.minX + 250, centre.x - range),
        maxX: Math.min(C.LIMIT.maxX - 250, centre.x + range),
        minY: Math.max(C.LIMIT.minY + 250, centre.y - range),
        maxY: Math.min(C.LIMIT.maxY - 250, centre.y + range),
      },
      id = ++job,
      start = performance.now();
    worker = new Worker(new URL("./skyline-worker.js", import.meta.url), {
      type: "module",
    });
    state.searching = true;
    state.status = continuous ? "行進中／地平線搜尋中" : "搜尋中";
    state.message =
      "輸入只有地平線曲線與估計位置周邊搜尋區；模擬真值不傳入定位器。";
    const fail = (message) => {
      if (id !== job) return;
      cancel();
      state.status = "無定位";
      state.message = "搜尋失敗：" + message;
    };
    worker.onerror = (e) => fail(e.message);
    worker.onmessage = ({ data }) => {
      if (data.id !== job) return;
      if (data.type === "progress") {
        state.progress = `搜尋 ${Math.round(data.value * 100)}%`;
        return;
      }
      if (data.type === "error") return fail(data.message);
      const result = data.result;
      worker.terminate();
      worker = null;
      state.searching = false;
      state.result = result;
      state.status = { good: "定位良好", uncertain: "不確定", lost: "無定位" }[
        result.status
      ];
      state.progress = `完成 · ${((performance.now() - start) / 1000).toFixed(1)} 秒`;
      const before = C.distance(state.truth, state.estimate);
      result.candidates.forEach((v, i) => {
        L.circleMarker(ll(v), {
          radius: 12 - i * 2,
          color: i ? "#f4d19d" : "#7fe9d4",
          fillOpacity: 0.15,
        })
          .addTo(candidateLayer)
          .bindTooltip("候選 " + (i + 1));
        const ray = state.regional ? 4000 : 140;
        L.polyline(
          [
            ll(v),
            ll({
              x: v.x + Math.sin(v.heading * C.DEG) * ray,
              y: v.y + Math.cos(v.heading * C.DEG) * ray,
            }),
          ],
          { color: "#7fe9d4", weight: 3 },
        ).addTo(candidateLayer);
      });
      const best = result.candidates[0];
      drawCurve(best);
      if (result.status === "good" && best) {
        // Search describes the capture instant; carry intervening odometry forward.
        state.estimate = {
          x: best.x + (continuous ? state.estimate.x - capturePose.x : 0),
          y: best.y + (continuous ? state.estimate.y - capturePose.y : 0),
          heading: C.modDeg(best.heading + (continuous
            ? state.estimate.heading - capturePose.heading : 0)),
        };
        state.localizationCount++;
        if (!continuous) clearRoute();
        else {
          const goal = state.targets.find(t => t.id === state.destination);
          if (goal) {
            const remaining = C.planPath(state.estimate, goal);
            // Preserve the ideal baseline while updating only the remaining route.
            const baseline = idealLayer, status = state.straightStatus;
            idealLayer = null;
            installRoute(remaining);
            idealLayer = baseline;
            state.straightStatus = status;
            if (!remaining.reachable) {
              stop();
              state.routeStatus = "定位後無可通行路線，已停止行進。";
            }
          }
        }
        trail.addLatLng(ll(state.estimate));
        state.message = result.reason + (continuous
          ? "；已補回搜尋期間位移，已更新剩餘路線。"
          : "；已套用校正，請重新規劃後繼續。");
        state.evaluation = `校正前 ${fmt(before)} → 校正後 ${fmt(C.distance(state.truth, state.estimate))}；同 DEM 模擬評估`;
      } else {
        state.message = result.reason + "；保留原估計，請增加視角後再掃描。";
        state.evaluation = "未套用候選；原導航估計保持不變。";
      }
      render();
    };
    worker.postMessage({
      id,
      dem: dem.value,
      observation,
      bounds: searchBounds,
      options: state.regional
        ? { coarseStep: 4000, candidateSeparation: 8000 }
        : {},
    });
  }
  function drawCurve(candidate) {
    const cv = curve.value;
    if (!cv) return;
    const ctx = cv.getContext("2d"),
      w = cv.width,
      h = cv.height;
    ctx.clearRect(0, 0, w, h);
    if (!observation) return;
    const obs = observation,
      p = candidate ? S.profile(candidate, obs.options) : null,
      vals = obs.elevations
        .filter(Number.isFinite)
        .concat(p ? p.elevations.filter(Number.isFinite) : []);
    if (!vals.length) return;
    const lo = Math.min(...vals) - 0.3,
      hi = Math.max(...vals) + 0.3;
    ctx.fillStyle = "#15232a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c9d5d5";
    ctx.font = "12px system-ui";
    ctx.fillText(
      `觀測（橘）／候選（青） · 0–360° · ${lo.toFixed(1)}–${hi.toFixed(1)}°`,
      12,
      18,
    );
    function line(values, valid, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let open = false;
      values.forEach((v, i) => {
        if (!valid[i] || !Number.isFinite(v)) {
          open = false;
          return;
        }
        const x = (i / (values.length - 1)) * w,
          y = 30 + ((hi - v) / (hi - lo)) * (h - 45);
        if (open) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        open = true;
      });
      ctx.stroke();
    }
    line(obs.elevations, obs.valid, "#ffb477");
    if (p) {
      const values = [],
        valid = [];
      for (let i = 0; i < p.angles.length; i++) {
        const q =
            (i + candidate.heading / (360 / p.angles.length)) % p.angles.length,
          j = Math.floor(q),
          k = (j + 1) % p.angles.length;
        values.push(
          p.elevations[j] * (1 - (q - j)) + p.elevations[k] * (q - j),
        );
        valid.push(p.valid[j] && p.valid[k]);
      }
      line(values, valid, "#82e6d2");
    }
  }
  function render() {
    if (!dem.value || !map) return;
    estimateMarker.setLatLng(ll(state.estimate));
    truthMarker.setLatLng(ll(state.truth));
    const cv = panorama.value;
    if (!cv) return;
    const W = cv.width,
      H = cv.height,
      ctx = cv.getContext("2d"),
      p = S.profile(state.truth, profileOptions),
      heading = C.modDeg(state.truth.heading + state.viewYaw);
    ctx.fillStyle = "#a68470";
    ctx.fillRect(0, 0, W, H);
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i <= W; i += 3) {
      const angle = C.modDeg(heading + (i / W - 0.5) * 120),
        k = Math.round(angle / (360 / p.angles.length)) % p.angles.length,
        v = p.elevations[k];
      ctx.lineTo(i, Number.isFinite(v) ? H * 0.75 - v * 5 : H);
    }
    ctx.lineTo(W, H);
    ctx.fillStyle = "#553d36";
    ctx.fill();
    const eye = C.elevation(state.truth.x, state.truth.y) + 1.7;
    const markers = [...state.pois, ...state.targets];
    const seen = new Set();
    const labels = [];
    for (const marker of markers) {
      if (seen.has(marker.id)) continue;
      seen.add(marker.id);
      const distance = C.distance(state.truth, marker);
      const z = C.elevation(marker.x, marker.y);
      if (!Number.isFinite(z) || distance < 1) continue;
      const bearing = C.modDeg(Math.atan2(marker.x - state.truth.x, marker.y - state.truth.y) / C.DEG);
      const delta = ((bearing - heading + 540) % 360) - 180;
      const selected = marker.id === state.destination || marker.id === state.poi?.id;
      if (Math.abs(delta) > 60 && !selected) continue;
      const angle = Math.atan2(z - eye, distance) / C.DEG;
      let hidden = false;
      const step = Math.max(40, distance / 100);
      for (let d = step; d < distance - step / 2; d += step) {
        const t = d / distance;
        const terrain = C.elevation(state.truth.x + (marker.x - state.truth.x) * t, state.truth.y + (marker.y - state.truth.y) * t);
        if (!Number.isFinite(terrain) || terrain > eye + (z - eye) * t + 1) {
          hidden = true;
          break;
        }
      }
      labels.push({ marker, distance, delta, selected, hidden, angle });
    }
    labels.sort((a, b) => Number(b.selected) - Number(a.selected) || a.distance - b.distance);
    const occupied = [];
    for (const item of labels) {
      const { marker, distance, delta, selected, hidden, angle } = item;
      const outside = Math.abs(delta) > 60;
      const x = C.clamp((delta / 120 + 0.5) * W, 12, W - 12);
      const y = C.clamp(H * 0.75 - angle * 5, 65, H - 32);
      const text = `${outside ? (delta < 0 ? '◀ ' : '▶ ') : ''}${marker.name} · ${fmt(distance)}${outside ? ' · 視野外' : hidden ? ' · 地形遮擋' : ''}`;
      ctx.font = `${selected ? 'bold ' : ''}12px system-ui`;
      const width = Math.min(W - 16, ctx.measureText(text).width + 16);
      const left = C.clamp(x - width / 2, 8, W - width - 8);
      let row = 0;
      while (row < 3 && occupied.some((v) => v.row === row && left < v.right + 6 && left + width > v.left - 6)) row++;
      if (row === 3) continue;
      occupied.push({ row, left, right: left + width });
      const top = 34 + row * 25;
      const color = selected ? '#82e6d2' : '#ffe0a3';
      ctx.strokeStyle = color;
      ctx.setLineDash(hidden || outside ? [4, 3] : []);
      ctx.beginPath();
      ctx.moveTo(left + width / 2, top + 20);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#15232a';
      ctx.fillRect(left, top, width, 21);
      ctx.fillStyle = color;
      ctx.fillText(text, left + 8, top + 15, width - 16);
      ctx.beginPath();
      ctx.arc(x, y, selected ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#fff0d6";
    ctx.font = "13px system-ui";
    ctx.fillText(`模擬視角 · yaw ${heading.toFixed(0)}° · 非真實照片`, 12, 22);
  }
  function terrainImage(kind) {
    const cv = document.createElement("canvas");
    cv.width = 243;
    cv.height = 176;
    const ctx = cv.getContext("2d"),
      img = ctx.createImageData(cv.width, cv.height);
    for (let j = 0; j < cv.height; j++)
      for (let i = 0; i < cv.width; i++) {
        const x =
            C.LIMIT.minX + (i / (cv.width - 1)) * (C.LIMIT.maxX - C.LIMIT.minX),
          y =
            C.LIMIT.maxY -
            (j / (cv.height - 1)) * (C.LIMIT.maxY - C.LIMIT.minY),
          z = kind === "slope" ? C.slopeDeg(x, y) : C.elevation(x, y),
          v =
            kind === "slope"
              ? C.clamp(z / 30, 0, 1)
              : C.clamp((z + 2700) / 900, 0, 1),
          k = (j * cv.width + i) * 4;
        img.data[k] = 50 + 200 * v;
        img.data[k + 1] = 115 + 70 * v;
        img.data[k + 2] = 130 - 50 * v;
        img.data[k + 3] = Number.isFinite(z) ? 210 : 0;
      }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }
  function setLayer() {
    if (!map || !dem.value) return;
    remove(analysis);
    state.units = [];
    const kind = state.layer;
    if (kind === "geology") {
      if (state.regional) {
        state.legend = "此區尚無已接入的地質單元圖；不套用 Jezero 地質分類。";
        return;
      }
      const seen = new Set();
      analysis = L.layerGroup(
        geology.features.map((f) => {
          const color = `rgb(${(unitStyle(f)?.symbol?.color || [150, 150, 150]).slice(0, 3).join(",")})`,
            label = unitLabel(f);
          if (!seen.has(label)) {
            seen.add(label);
            state.units.push({ label, color });
          }
          return L.polygon(
            f.rings.map((r) => r.map(([x, y]) => ll({ x, y }))),
            { color, weight: 1, fillOpacity: 0.55 },
          ).bindTooltip(esc(label));
        }),
      ).addTo(map);
      state.legend = "USGS Sun & Stack 2020 · 1:75,000";
    } else if (kind !== "none") {
      if (state.regional) {
        analysis = L.layerGroup().addTo(map);
        for (let j = 2; j < dem.value.height - 2; j += 4)
          for (let i = 2; i < dem.value.width - 2; i += 4) {
            const p = {
                x: dem.value.xMin + i * 4000,
                y: dem.value.yMax - j * 4000,
              },
              v =
                kind === "slope" ? C.slopeDeg(p.x, p.y) : C.elevation(p.x, p.y),
              f =
                kind === "slope"
                  ? C.clamp(v / 24, 0, 1)
                  : C.clamp((v + 8200) / 30000, 0, 1);
            L.circleMarker(ll(p), {
              radius: 4,
              color: `hsl(${220 - f * 220} 65% 60%)`,
              weight: 0,
              fillOpacity: 0.7,
            })
              .bindTooltip(
                `${v.toFixed(1)} ${kind === "slope" ? "°" : "m"} · MOLA 衍生`,
              )
              .addTo(analysis);
          }
        state.legend = "MOLA 區域取樣點；無法解析近距離障礙物。";
      } else {
        analysis = L.imageOverlay(terrainImage(kind), bounds, {
          opacity: 0.6,
        }).addTo(map);
        state.legend =
          kind === "slope"
            ? "0–30° 坡度 · DEM 衍生；缺值透明"
            : "−2700 至 −1800 m 高程色階";
      }
    } else
      state.legend = state.regional
        ? "MOLA 全球地形陰影 · 16 ppd，赤道約 3.7 km/格"
        : "CTX 光學影像 · 原生 5 m，展示約 8.1 m/pixel";
    estimateMarker.bringToFront();
  }
  function stopDrawing() {
    stroke = false;
    state.drawMode = null;
    if (map) {
      map.dragging.enable();
      map.doubleClickZoom.enable();
    }
  }
  function drawPreview() {
    remove(preview);
    preview = L.layerGroup().addTo(map);
    if (state.points.length > 1)
      L.polyline(state.points.map(ll), {
        color: "#83e5d2",
        weight: 4,
        dashArray: "5 5",
        interactive: false,
      }).addTo(preview);
    state.points.forEach((p) =>
      L.circleMarker(ll(p), {
        radius: 3,
        color: "#e9d5ad",
        interactive: false,
      }).addTo(preview),
    );
    state.drawStatus = `已繪製 ${state.points.length} 個點；起點為導航估計位置。`;
  }
  function beginDrawing(mode) {
    if (!dem.value) return;
    stop();
    cancel();
    resetDrawing();
    clearRoute();
    map.closePopup();
    map.fitBounds(bounds, { animate: false });
    state.drawMode = mode;
    state.pickingTarget = false;
    state.points = [{ x: state.estimate.x, y: state.estimate.y }];
    if (mode === "freehand") map.dragging.disable();
    map.doubleClickZoom.disable();
    state.routeStatus = "自訂路線編輯中，尚未檢查通行狀態。";
    drawPreview();
  }
  function append(p) {
    if (C.distance(state.points.at(-1), p) >= 15) {
      state.points.push(p);
      drawPreview();
    }
  }
  function routeCheck(points) {
    let length = 0,
      maxSlope = 0;
    const invalid = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        d = C.distance(a, b);
      length += d;
      if (!C.segmentSafe(a, b)) invalid.push(i);
      const n = Math.max(1, Math.ceil(d / 15));
      for (let k = 0; k <= n; k++) {
        const t = k / n,
          s = C.slopeDeg(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
        if (Number.isFinite(s)) maxSlope = Math.max(maxSlope, s);
      }
    }
    return {
      path: points.map((p) => ({ ...p })),
      length,
      maxSlope,
      invalidSegments: invalid,
      reachable: points.length >= 2 && !invalid.length,
      custom: true,
    };
  }
  function finishDrawing() {
    if (state.points.length < 2 || !slopeValid()) return;
    stopDrawing();
    remove(preview);
    const route = routeCheck(state.points);
    installRoute(route);
    state.routeStatus = route.reachable
      ? `自訂路線可通行 · 最大坡度 ${route.maxSlope.toFixed(1)}°`
      : `自訂路線含 ${route.invalidSegments.length} 段超坡、缺測或越界區段（紅色），禁止行進。`;
    state.drawStatus = `${route.path.length} 個點 · ${fmt(route.length)} · ${route.reachable ? "通過" : "未通過"} DEM 檢查`;
  }
  function undo() {
    if (state.points.length < 2) return;
    stop();
    clearRoute();
    state.points.pop();
    drawPreview();
  }
  function clearDrawing() {
    stop();
    resetDrawing();
    if (state.route?.custom) clearRoute();
  }
  function selectPoi(p) {
    state.poi = p;
    if (state.targets.some((t) => t.id === p.id)) state.destination = p.id;
    map.panTo(ll(p));
    const r = C.risk(p.x, p.y);
    L.popup()
      .setLatLng(ll(p))
      .setContent(
        `<strong>${esc(p.name)}</strong><p>${esc(p.kind)}</p><p>${esc(p.status || p.science || "")}</p><p>${r.unknown ? "缺測／未知" : r.blocked ? "超過坡度上限" : "DEM 可通行"} · 高程 ${C.elevation(p.x, p.y).toFixed(1)} m</p><p>${esc(unitLabel(unitAt(p)))}</p>`,
      )
      .openOn(map);
  }
  function beginTarget() {
    state.pickingStart = false;
    if (!state.ready) return;
    stop();
    resetDrawing();
    state.pickingTarget = !state.pickingTarget;
    state.routeStatus = state.pickingTarget
      ? "請在地圖上點選任意觀測位置；超出範圍會自動擴大 MOLA 覆蓋。"
      : "已取消新增觀測點。";
  }
  async function coverTarget(geo) {
    if (inDem(geo)) return true;
    if (state.regionLoading) return false;
    const token = ++regionToken;
    const start = C.localToLatLng(missionStart.x, missionStart.y);
    const truth = { ...state.truth, ...C.localToLatLng(state.truth.x, state.truth.y) };
    const estimate = { ...state.estimate, ...C.localToLatLng(state.estimate.x, state.estimate.y) };
    const targets = state.targets.map(t => ({ ...t, ...C.localToLatLng(t.x, t.y) }));
    const name = state.targetName;
    const points = [start, truth, estimate, ...targets, geo];
    // Centre the new spherical frame between the selected locations.
    const v = points.reduce((v,p) => {
      const a=p.lat*C.DEG,b=p.lng*C.DEG;
      return [v[0]+Math.cos(a)*Math.cos(b),v[1]+Math.cos(a)*Math.sin(b),v[2]+Math.sin(a)];
    }, [0,0,0]);
    const origin = Math.hypot(...v)>1e-8
      ? {lat:Math.atan2(v[2],Math.hypot(v[0],v[1]))/C.DEG,lng:Math.atan2(v[1],v[0])/C.DEG}
      : {lat:0,lng:((start.lng+270)%360+360)%360-180};
    stop(); cancel();
    state.regionLoading = true;
    state.regionStatus = "正在擴大 MOLA 覆蓋範圍，保留起點與觀測點…";
    try {
      const planet = await loadPlanet();
      if (disposed || token !== regionToken) return false;
      const grid = planet.region(origin.lat, origin.lng, points);
      C.setDEM(grid);
      dem.value = grid;
      state.regional = true;
      missionStart = C.latLngToLocal(start.lat,start.lng);
      state.targets = targets.map(t => ({...t,...C.latLngToLocal(t.lat,t.lng)}));
      profileOptions = {angleStep:6,rayStep:grid.source.sample_step_m,maxRange:Math.max(100000,grid.source.sample_step_m*25),cameraHeight:1.7,curvature:true};
      refreshMission();
      state.truth = {...truth,...C.latLngToLocal(truth.lat,truth.lng)};
      state.estimate = {...estimate,...C.latLngToLocal(estimate.lat,estimate.lng)};
      trail.setLatLngs([ll(state.estimate)]);
      state.targetName = name;
      state.pickingTarget = true;
      state.regionStatus = `MOLA 覆蓋已擴大至 ${(grid.xMax-grid.xMin)/1000} × ${(grid.yMax-grid.yMin)/1000} km · 格距 ${grid.source.sample_step_m/1000} km；遠距規劃為粗略模擬。`;
      render();
      return true;
    } catch(e) {
      state.regionStatus = "MOLA 擴大失敗：" + e.message + "；請重新選點重試。";
      return false;
    } finally {
      if(token===regionToken) state.regionLoading = false;
    }
  }
  function addTarget(p) {
    if (!state.pickingTarget) return;
    if (!C.validDEMPoint(p.x, p.y)) {
      state.routeStatus = "此位置超出有效高程範圍，請在區域內重新選點。";
      return;
    }
    const target = {
      ...p,
      id: "custom-" + crypto.randomUUID(),
      name: state.targetName.trim() || "自訂觀測點 " + (state.targets.length + 1),
      unit: state.regional ? "MOLA 區域地形" : unitLabel(unitAt(p)),
      kind: "使用者自訂觀測點",
    };
    stop();
    clearRoute();
    state.targets.push(target);
    state.destination = target.id;
    state.poi = target;
    state.pickingTarget = false;
    state.targetName = "";
    refreshPois();
    state.routeStatus = `已新增「${target.name}」，可規劃路線檢查是否可達。`;
  }
  function removeTarget() {
    const id = state.destination;
    if (!id.startsWith("custom-")) return;
    stop();
    clearRoute();
    state.targets = state.targets.filter((p) => p.id !== id);
    if (state.poi?.id === id) state.poi = null;
    state.destination = state.targets[0]?.id || "";
    refreshPois();
    state.routeStatus = "已刪除觀測點，請選擇或新增觀測點。";
  }
  function refreshPois() {
    poiLayer.clearLayers();
    const landing = {
      ...C.latLngToLocal(18.4446, 77.4509),
      id: "butler",
      name: "Octavia E. Butler Landing",
      kind: "NASA 命名歷史著陸點（非即時車輛位置）",
      status: "座標依 Bell et al. 2022；NASA 任務團隊命名。",
      source:
        "https://science.nasa.gov/resource/welcome-to-octavia-e-butler-landing/",
    };
    state.pois = [
      ...(state.regional ? [] : [landing]),
      ...C.FEATURES.map((p) => ({
        ...p,
        kind: "DEM 自動候選峰（非正式地名）",
      })),
    ];
    for (const p of [...state.pois, ...state.targets.filter((p) => p.id.startsWith("custom-"))])
      L.circleMarker(ll(p), {
        radius: p.id.startsWith("P") ? 4 : 6,
        color: "#e3cb86",
        fillOpacity: 0.8,
      })
        .addTo(poiLayer)
        .bindTooltip(esc(p.name))
        .on("click", () => selectPoi(p));
  }
  function filterNames() {
    if (!namesLayer) return;
    namesLayer.clearLayers();
    for (const p of displayed.value)
      L.circleMarker([p.lat, p.lng], {
        radius: p.featured ? 6 : 4,
        color: "#ffd181",
        weight: 1.5,
        fillOpacity: 0.8,
      })
        .addTo(namesLayer)
        .bindTooltip(esc(p.zh || p.name))
        .on("click", () => {
          if (state.tab !== "explore" || state.pickingStart || state.pickingTarget || state.drawMode) return;
          state.selected = p;
          state.lat = p.lat;
          state.lng = p.lng;
          state.tab = "explore";
          state.panelOpen = true;
        });
  }
  function selectName(p) {
    stop();
    cancel();
    stopDrawing();
    state.selected = p;
    state.lat = p.lat;
    state.lng = p.lng;
    const width = Math.max(0.15, Math.min(80, p.diameterKm / 50));
    map.fitBounds(
      [
        [Math.max(-89, p.lat - width * 0.6), p.lng - width],
        [Math.min(89, p.lat + width * 0.6), p.lng + width],
      ],
      { maxZoom: 10, animate: false },
    );
  }
  function scope() {
    if (!dem.value) return;
    const c = map.getCenter(),
      isLocal = state.regional || (
        inDem({ lat: c.lat, lng: c.lng }) &&
        map.getZoom() >=
          8);
    for (const layer of [estimateMarker, trail, routeLayer, poiLayer]) {
      if (!layer) continue;
      if (isLocal) layer.addTo(map);
      else remove(layer);
    }
    if (isLocal && state.truthVisible) truthMarker.addTo(map);
    else remove(truthMarker);
    state.mapTitle = isLocal
      ? state.regional
        ? `MOLA 區域 / ${dem.value.origin.lat.toFixed(2)}°, ${dem.value.origin.lng.toFixed(2)}°`
        : "Jezero / 18.44°N, 77.42°E"
      : "火星地理導覽 / MGS MOLA";
    state.mapContext = isLocal
      ? state.regional
        ? (inDem(c) ? "MOLA 約 3.7 km · 未校準定位" : "視野中心超出任務 DEM · 任務與標記已保留")
        : "局部 CTX 影像 · DEM 導航有效區"
      : "全球彩色地形陰影 · 可建立區域任務";
  }
  function overview() {
    stop();
    cancel();
    stopDrawing();
    state.query = "";
    state.type = "";
    map.closePopup();
    map.fitBounds(
      [
        [-65, -175],
        [70, 175],
      ],
      { animate: false },
    );
  }
  async function loadPlanet() {
    if (planet) return planet;
    if (!pendingPlanet)
      pendingPlanet = Promise.all([
        json("data/mola16.json", { signal: abort.signal }),
        fetch(asset("data/mola16.bin"), { signal: abort.signal }).then((r) => {
          if (!r.ok) throw Error("全球 MOLA 數值資料缺失");
          return r.arrayBuffer();
        }),
      ])
        .then(([meta, b]) => (planet = P.load(b, meta)))
        .catch((e) => {
          pendingPlanet = null;
          throw e;
        });
    return pendingPlanet;
  }
  function refreshMission() {
    state.pickingTarget = false;
    state.targetName = "";
    state.poi = null;
    stop();
    cancel();
    resetDrawing();
    clearRoute();
    remove(analysis);
    state.layer = "none";
    state.destination = state.targets[0]?.id || "";
    state.optical = !state.regional;
    if (state.regional) remove(optical);
    else optical.addTo(map);
    if (state.regional) {
      const edge = [];
      for (let i = 0; i <= 16; i++) {
        const x = C.LIMIT.minX + (C.LIMIT.maxX - C.LIMIT.minX) * i / 16;
        const y = C.LIMIT.minY + (C.LIMIT.maxY - C.LIMIT.minY) * i / 16;
        edge.push(ll({ x, y: C.LIMIT.minY }), ll({ x, y: C.LIMIT.maxY }),
          ll({ x: C.LIMIT.minX, y }), ll({ x: C.LIMIT.maxX, y }));
      }
      bounds = L.latLngBounds(edge);
    } else
      bounds = [
        ll({ x: C.LIMIT.minX, y: C.LIMIT.minY }),
        ll({ x: C.LIMIT.maxX, y: C.LIMIT.maxY }),
      ];
    refreshPois();
    setLayer();
    reset("good");
    map.closePopup();
    map.fitBounds(bounds, { animate: false });
    if (state.regional) {
      remove(stationLayer);
      remove(expeditionLayer);
    } else {
      stationLayer?.addTo(map);
      expeditionLayer?.addTo(map);
    }
    state.warning = state.regional
      ? "全球真實 MOLA 高程 · 區域規劃 · 非障礙物尺度導航"
      : `真實 Jezero DEM · ${dem.value.width}×${dem.value.height} · 觀測為模擬`;
    state.source = state.regional
      ? `NASA PDS MOLA 16 ppd，來源含插值；球面方位等距投影。SHA-256 ${dem.value.source.original_sha256}`
      : `USGS CTX 原生 20 m，展示約 40 m；光學原生 5 m。地質 Sun & Stack 2020，1:75,000。SHA-256 ${dem.value.source.original_sha256}；未獨立估計配準誤差。`;
    scope();
  }
  async function startRegion() {
    if (!state.ready) return;
    const lat = Number(state.lat),
      lng = Number(state.lng);
    if (
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      !Number.isFinite(lng) ||
      Math.abs(lng) > 180
    ) {
      state.regionStatus = "緯度須在 −90 至 90，經度須在 −180 至 180。";
      return;
    }
    if (!slopeValid()) return;
    const token = ++regionToken;
    stop();
    cancel();
    state.regionLoading = true;
    state.regionStatus = "讀取全球 MOLA 數值高程（約 33 MB，首次載入）…";
    try {
      const p = await loadPlanet();
      if (disposed || token !== regionToken) return;
      stop();
      cancel();
      const grid = p.region(lat, lng);
      C.setDEM(grid);
      dem.value = grid;
      state.regional = true;
      missionStart = { x: 0, y: 0 };
      profileOptions = {
        angleStep: 6,
        rayStep: 4000,
        maxRange: 100000,
        cameraHeight: 1.7,
        curvature: true,
      };
      state.estimate = { x: 650, y: -520, heading: 69 };
      state.targets = [];
      refreshMission();
      state.regionStatus = `已建立 512×512 km 區域任務 · 中心高程 ${p.sample(lat, lng).toFixed(0)} m。定位候選未校準，不自動校正；極區顯示會變形。`;
      state.routeStatus = "請自行新增觀測點，再規劃路線。";
      return true;
    } catch (e) {
      if (!disposed && token === regionToken)
        state.regionStatus =
          "區域載入失敗：" + e.message + "；可再次點擊建立任務重試。";
    } finally {
      if (token === regionToken) state.regionLoading = false;
    }
  }
  function restore() {
    regionToken++;
    state.regionLoading = false;
    if (!snapshot) return;
    state.regional = false;
    dem.value = snapshot.dem;
    geology = snapshot.geology;
    missionStart = snapshot.mission.start;
    state.targets = [];
    profileOptions = undefined;
    C.setDEM(dem.value);
    refreshMission();
    state.regionStatus = "已切回 Jezero 較細的 CTX DEM。";
  }
  function bearingDemo() {
    const a = C.associate(
        C.captureObservations(state.truth, state.truth.heading),
      ),
      r = C.refinePose(a.pairs, state.estimate);
    state.bearing = r.ok
      ? `模擬方位解算 E ${r.x.toFixed(0)} / N ${r.y.toFixed(0)}，yaw ${r.heading.toFixed(1)}°，RMS ${r.rmsDeg.toFixed(3)}°；未套用導航估計。`
      : "有效地標不足或未收斂。";
  }
  function planExpedition() {
    if (state.regional) restore();
    stop();
    cancel();
    if (!slopeValid()) return;
    const start = { x: -1400, y: -820 },
      end = C.latLngToLocal(18.45262651, 77.40775601),
      points = [start, end, start],
      names = ["規劃起點 → Three Forks", "Three Forks → 返回"];
    state.expedition = names.map((name, i) => ({
      ...C.planPath(points[i], points[i + 1]),
      name,
    }));
    remove(expeditionLayer);
    expeditionLayer = L.layerGroup().addTo(map);
    state.expedition.forEach((leg, i) => {
      if (leg.reachable)
        L.polyline(leg.path.map(ll), {
          color: ["#83e5d2", "#ffbb79", "#b9b1ef"][i],
          weight: 5,
          dashArray: i === 1 ? "8 6" : null,
        })
          .addTo(expeditionLayer)
          .bindTooltip("假想人員路線 · " + leg.name)
          .on("click", () => {
            state.profileIndex = i;
            drawProfile();
          });
    });
    state.expeditionStatus = state.expedition.every((l) => l.reachable)
      ? `往返路線 ${fmt(state.expedition.reduce((sum, l) => sum + l.length, 0))} · 非真實毅力號軌跡`
      : "部分路段不可達，勿視為可通行。";
    state.profileIndex = 0;
    nextTick(drawProfile);
    map.fitBounds(bounds, { animate: false });
  }
  function drawProfile() {
    const leg = state.profileIndex === -1
        ? state.route && { ...state.route, name: "目前路線" }
        : state.expedition[state.profileIndex],
      cv = profileCanvas.value;
    if (!cv) return;
    if (!leg) {
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      state.profileInfo = "請先建立一般路線、手繪路線或 Three Forks 往返路線，以顯示高程剖面。";
      return;
    }
    const ctx = cv.getContext("2d"),
      samples = [];
    let d = 0,
      maxSlope = 0,
      missing = 0;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1],
        b = leg.path[i],
        len = C.distance(a, b),
        n = Math.max(1, Math.ceil(len / 15));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n,
          x = a.x + (b.x - a.x) * t,
          y = a.y + (b.y - a.y) * t,
          z = C.elevation(x, y),
          s = C.slopeDeg(x, y);
        if (Number.isFinite(s)) maxSlope = Math.max(maxSlope, s);
        if (!Number.isFinite(z)) missing++;
        samples.push({ distance: d + len * t, z });
      }
      d += len;
    }
    const finite = samples.map((p) => p.z).filter(Number.isFinite);
    if (!finite.length) {
      state.profileInfo = "不可達路段，沒有可用剖面。";
      return;
    }
    const lo = Math.min(...finite),
      hi = Math.max(...finite);
    ctx.strokeStyle = "#83e5d2";
    ctx.lineWidth = 2;
    ctx.beginPath();
    let open = false;
    for (const p of samples) {
      if (!Number.isFinite(p.z)) {
        open = false;
        continue;
      }
      const x = 12 + (p.distance / Math.max(d, 1)) * (cv.width - 24),
        y = 20 + ((hi - p.z) / Math.max(hi - lo, 1)) * (cv.height - 40);
      if (open) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      open = true;
    }
    ctx.stroke();
    state.profileInfo = `${leg.name} · ${fmt(d)} · 最大格網坡度 ${maxSlope.toFixed(1)}° · 缺值 ${missing}；每 ≤15 m 取樣數值 DEM，非影像高程。`;
  }
  function showStation(f) {
    if (state.regional) restore();
    state.selected = null;
    state.station = f;
    map.setView([f.geometry.coordinates[1], f.geometry.coordinates[0]], 14);
  }
  function initStations(data) {
    state.stations = data.features;
    stationLayer = L.layerGroup().addTo(map);
    for (const f of data.features)
      L.circleMarker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
        radius: 5,
        color: "#f4ce81",
        fillOpacity: 0.8,
      })
        .addTo(stationLayer)
        .bindTooltip(esc(f.properties.name))
        .on("click", () => {
          state.station = f;
          state.tab = "mission";
          state.panelOpen = true;
        });
    state.expeditionStatus = `已串接 ${data.features.length} 筆 PDS 歷史紀錄。`;
  }
  async function mount(container) {
    map = L.map(container, {
      crs: L.extend({}, L.CRS.EPSG4326, {
        code: "MARS:LOCAL",
        distance: (a, b) =>
          C.distance(
            C.latLngToLocal(a.lat, a.lng),
            C.latLngToLocal(b.lat, b.lng),
          ),
      }),
      minZoom: 0,
      maxZoom: 15,
      zoomControl: false,
      zoomSnap: 0.1,
    }).setView([18.44, 77.42], 9);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl
      .setPrefix(false)
      .addAttribution(
        "NASA/JPL-Caltech/MSSS · USGS Sun & Stack 2020 · MGS/MOLA",
      );
    candidateLayer = L.layerGroup().addTo(map);
    poiLayer = L.layerGroup().addTo(map);
    namesLayer = L.layerGroup().addTo(map);
    estimateMarker = L.circleMarker([18.44, 77.42], {
      radius: 8,
      color: "#9af0e0",
      fillOpacity: 1,
    })
      .addTo(map)
      .bindTooltip("導航估計位置");
    truthMarker = L.circleMarker([18.44, 77.42], {
      radius: 6,
      color: "#ffad72",
    }).bindTooltip("模擬真值（評估用）");
    trail = L.polyline([], { color: "#eeb584", weight: 2 }).addTo(map);
    map.on("mousemove", (e) => {
      const p = local(e),
        localZ = C.demAt(p.x, p.y),
        z = Number.isFinite(localZ)
          ? localZ
          : planet?.sample(e.latlng.lat, e.latlng.lng),
        height = Number.isFinite(z) ? `高度 ${z.toFixed(1)} m` : "高度：無資料";
      state.coords = `${e.latlng.lat.toFixed(5)}°N ${e.latlng.lng.toFixed(5)}°E · ${height} · ${unitLabel(unitAt(p))}`;
      state.elevation = Number.isFinite(z)
        ? `游標高程 ${z.toFixed(1)} m · ${Number.isFinite(localZ) && !state.regional ? "Jezero DEM" : "MOLA 16 ppd"}`
        : "游標高程：無資料";
    });
    map.on("click", async (e) => {
      if (state.pickingStart) {
        if (state.regionLoading) return;
        if (!inDem(e.latlng)) {
          state.lat = e.latlng.lat;
          state.lng = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180;
          if (!(await startRegion())) return;
        }
        const p = local(e);
        if (!C.validDEMPoint(p.x, p.y) || C.risk(p.x, p.y).blocked) {
          state.routeStatus = "請選有高程資料且符合坡度門檻的起點。";
          return;
        }
        missionStart = { ...p };
        reset();
        state.pickingStart = false;
        state.truth = { ...p, heading: 45 };
        state.estimate = { ...p, heading: 45 };
        trail.setLatLngs([ll(p)]);
        state.routeStatus = "起點已設定，請選終點並建立路線。";
        render();
      }
      else if (state.pickingTarget) {
        const geo = {lat:e.latlng.lat,lng:((e.latlng.lng+180)%360+360)%360-180};
        if (await coverTarget(geo)) addTarget(C.latLngToLocal(geo.lat,geo.lng));
      }
      else if (state.drawMode === "points") append(local(e));
    });
    map.on("moveend zoomend", scope);
    map.on("moveend", () => {
      if (!state.coordinateEditing) {
        state.lat = Number(map.getCenter().lat.toFixed(4));
        state.lng = Number(
          (((((map.getCenter().lng + 180) % 360) + 360) % 360) - 180).toFixed(
            4,
          ),
        );
      }
    });
    const point = (e) => {
      const b = container.getBoundingClientRect(),
        v = map.containerPointToLatLng([e.clientX - b.left, e.clientY - b.top]);
      return C.latLngToLocal(v.lat, v.lng);
    };
    const down = (e) => {
      if (
        state.drawMode !== "freehand" ||
        e.button !== 0 ||
        e.target.closest(".leaflet-control,.leaflet-popup")
      )
        return;
      e.preventDefault();
      container.setPointerCapture(e.pointerId);
      stroke = true;
      append(point(e));
    };
    const move = (e) => {
      if (stroke) {
        e.preventDefault();
        append(point(e));
      }
    };
    const end = (e) => {
      if (stroke) {
        append(point(e));
        stroke = false;
      }
      if (container.hasPointerCapture(e.pointerId))
        container.releasePointerCapture(e.pointerId);
    };
    container.addEventListener("pointerdown", down);
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerup", end);
    container.addEventListener("pointercancel", end);
    cleanupPointer = () => {
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerup", end);
      container.removeEventListener("pointercancel", end);
    };
    await boot();
  }
  let cleanupPointer;
  async function boot() {
    state.loading = true;
    state.error = "";
    try {
      const [grid, geo, mission, ctxSource, names, stations] =
        await Promise.all(
          [
            "jezero_dem.json",
            "geology.json",
            "mission.json",
            "ctx-source.json",
            "mars-names.json",
            "three-forks.geojson",
          ].map((p) => json("data/" + p, { signal: abort.signal })),
        );
      if (disposed) return;
      snapshot = { dem: grid, geology: geo, mission, ctxSource };
      dem.value = grid;
      geology = geo;
      missionStart = mission.start;
      state.targets = [];
      C.setDEM(grid);
      if (!optical) {
        optical = L.imageOverlay(
          asset("data/ctx.png"),
          [
            ll({ x: C.LIMIT.minX, y: C.LIMIT.minY }),
            ll({ x: C.LIMIT.maxX, y: C.LIMIT.maxY }),
          ],
          { opacity: 1 },
        ).addTo(map);
        optical.on("error", () => {
          state.warning = "CTX 光學裁切載入失敗；地圖不可視為影像底圖。";
        });
        for (const offset of [-360, 0, 360])
          L.imageOverlay(
            asset("data/mars-global-dem.jpg"),
            [
              [-90, -180 + offset],
              [90, 180 + offset],
            ],
            { zIndex: -1, interactive: false },
          )
            .addTo(map)
            .on("error", () => {
              state.namesError = "全球底圖載入失敗，請重新載入。";
            });
      }
      state.entries = names.entries;
      filterNames();
      initStations(stations);
      refreshMission();
      state.ready = true;
    } catch (e) {
      if (!disposed) {
        console.error(e);
        state.error = "資料載入失敗：" + e.message;
        state.warning = state.error;
      }
    } finally {
      state.loading = false;
    }
  }
  watch(displayed, filterNames);
  watch(() => state.layer, setLayer);
  watch(
    () => state.optical,
    (v) => {
      if (!map || !optical) return;
      if (v && !state.regional) optical.addTo(map);
      else remove(optical);
    },
  );
  watch(
    () => state.truthVisible,
    () => map && scope(),
  );
  watch(
    () => state.slope,
    () => {
      stop();
      cancel();
      clearRoute();
      state.routeStatus = "門檻已變更；請重新規劃。";
      if (state.points.length >= 2 && !state.drawMode) finishDrawing();
    },
  );
  watch(
    () => state.scenario,
    () => {
      stop();
      cancel();
      state.result = null;
      state.status = "觀測設定已變更";
      state.message = "保留導航估計；請重新掃描。";
    },
  );
  watch(() => state.continuousLocalization, (enabled) => {
    cancel();
    if (enabled && state.running) scan(true);
  });
  watch(() => state.profileIndex, drawProfile);
  watch(() => state.route, drawProfile);
  watch(profileCanvas, drawProfile);
  watch(panorama, render);
  watch(() => [state.viewYaw, state.destination, state.poi, state.pois, state.targets], render);
  watch(curve, () => drawCurve(state.result?.candidates[0]));
  onScopeDispose(() => {
    disposed = true;
    abort.abort();
    regionToken++;
    stop();
    cancel();
    cleanupPointer?.();
    map?.remove();
  });
  return {
    state,
    dem,
    position,
    errorDistance,
    matches,
    displayed,
    panorama,
    curve,
    profileCanvas,
    asset,
    fmt,
    typeLabels,
    mount,
    boot,
    reset,
    stop,
    cancel,
    plan,
    toggleMotion,
    drift,
    scan,
    drawCurve,
    turnView: (degrees) => { state.viewYaw = ((state.viewYaw + degrees + 540) % 360) - 180; },
    focusView: () => {
      const target = state.poi || state.targets.find((p) => p.id === state.destination);
      if (!target) return;
      state.viewYaw = C.modDeg(Math.atan2(target.x - state.truth.x, target.y - state.truth.y) / C.DEG - state.truth.heading);
    },
    beginDrawing,
    beginStart: () => {
      stop(); cancel(); resetDrawing();
      state.pickingTarget = false;
      state.pickingStart = !state.pickingStart;
      state.routeStatus = state.pickingStart ? "請在地圖選起點；選在目前區域外會以該處建立 MOLA 區域任務。" : "已取消選起點。";
    },
    beginTarget,
    removeTarget,
    finishDrawing,
    undo,
    clearDrawing,
    selectPoi,
    selectName,
    overview,
    startRegion,
    restore,
    bearingDemo,
    planExpedition,
    showStation,
    resize: () => map?.invalidateSize(),
    // Explicit test-only access; never installed on window in production.
    inspect: () => ({ dem: dem.value, observation, waypoint, profileOptions }),
    appendPoint: append,
  };
}
