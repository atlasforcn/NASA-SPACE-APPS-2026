import {
  reactive,
  markRaw,
  shallowRef,
  computed,
  watch,
  onScopeDispose,
  nextTick,
} from "vue";
import L from "leaflet";
import { createNavigationContext, createGeologyIndex } from './navigation-context.mjs';
import { createNavigationOverlay } from "./navigation-overlay";
import C from "../core.mjs";
import S from "../skyline.mjs";
import P from "../planet.mjs";
import { buildItinerary } from './routePlanner.mjs';
import { asset, json } from "./asset";
import { scienceLayerIds, createScienceLoader, scienceCell, sampleScienceGrid } from './science-layers.mjs';
import { colorizeScienceGrid, rasterScales } from './science-style.mjs';

function createUiId(prefix = "") {
  const crypto = globalThis.crypto;
  if (crypto?.randomUUID) return prefix + crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return prefix + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

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
    hasStart: false,
    loading: true,
    error: "",
    tab: "mission",
    panelOpen: true,
    localizationOpen: false,
    regional: false,
    globalView: false,
    siteId: "jezero",
    siteName: "Jezero",
    geologyAvailable: true,
    truth: { x: -1400, y: -820, heading: 45 },
    estimate: { x: -750, y: -1340, heading: 69 },
    travelled: 0,
    targets: [],
    destination: "",
    pickingTarget: false,
    pickingStart: false,
    straightStatus: "先選端點，再評估直線。",
    directRoute: null,
    routeOptions: null,
    selectedRoute: 'energy',
    stopIds: [],
    walk: null,
    planner: { speedKmh: 3, riskWeight: 1, highSlope: 10, roundTrip: false, stopMinutes: 15, budgetHours: 8, uphillPenalty: 10, downhillSaving: 5 },
    targetName: "",
    slope: 15,
    roughnessLimit: 1,
    showNavigationRisk: true,
    navigation: {geologyEnabled:true, thermalEnabled:false, sandFactor:1.8, rockFactor:1.25, unknownFactor:1.1, thermalThreshold:200, thermalFactor:1.2},
    navigationLoading: false, navigationError: '', navigationStatus: '',
    noGoZones: [], pickingNoGo: false, noGoRadius: 250, noGoName: '',
    route: null,
    routeStatus: "選擇科學點並規劃路線",
    running: false,
    scenario: "good",
    viewYaw: 0,
    horizonHover: "",
    externalHorizon: false,
    searching: false,
    continuousLocalization: true,
    localizationCount: 0,
    progress: "",
    status: "尚未設定起點",
    message: "請先在「任務」選擇起點，再進行導航與地平線定位。",
    result: null,
    truthVisible: false,
    evaluation: "",
    bearing: "",
    layer: "none",
    layers: [],
    layerStyles: Object.fromEntries(['terrain', 'slope', 'hillshade', 'roughness', 'geology', ...scienceLayerIds].map(id => [id, { opacity: 65, palette: 'heat', min: rasterScales[id]?.[0], max: rasterScales[id]?.[1] }])),
    scienceLayers: {},
    get scienceMeta() { return this.scienceLayers[this.layer]?.meta; },
    get scienceStatus() { return this.scienceLayers[this.layer]?.status || ''; },
    get scienceLoading() { return !!this.scienceLayers[this.layer]?.loading; },
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
    guidanceView: null,
    regionLoading: false,
    regionStatus: "全球數值高程於首次進入總覽或建立任務時載入。",
    elevation: "",
    query: "",
    type: "",
    entries: [],
    namesError: "",
    selected: null,
    namedTargetStatus: "",
    pois: [],
    poi: null,
    drawMode: null,
    points: [],
    drawStatus: "請先設定起點，再繪製路線。",
    stations: [],
    expedition: [],
    expeditionStatus: "",
    profileIndex: 0,
    profileInfo: "",
    profileHover: "",
    compareProfiles: false,
    profileLegend: [],
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
    globalBase,
    navigationOverlay,
    noGoLayer,
    regionalOverview = false,
    estimateMarker,
    truthMarker,
    trail,
    preview,
    poiLayer,
    namesLayer,
    candidateLayer,
    horizonHoverLayer,
    stationLayer,
    expeditionLayer;
  let idealLayer, profileMarker, profileSeries = [], profileScale;
  let bounds,
    planet,
    pendingPlanet,
    regionToken = 0,
    waypoint = 0,
    segmentProgress = 0,
    lastTime,
    lastDraw = 0,
    observation,
    observationPose,
    displayedCandidate,
    panoramaFrame,
    hoveredHorizonIndex,
    lastScanDistance = -Infinity,
    stroke = false;
  const abort = new AbortController();
  const scienceLoader = createScienceLoader(asset);
  let navigationThermal = null, geologyIndex = [], navigationLoadToken = 0;
  let scienceToken = 0;
  const position = computed(() => {
    if (!dem.value || !state.hasStart) return "尚未設定起點";
    const p = C.localToLatLng(state.estimate.x, state.estimate.y);
    return `${p.lat.toFixed(5)}°N / ${p.lng.toFixed(5)}°E`;
  });
  const errorDistance = computed(() =>
    state.hasStart ? fmt(C.distance(state.truth, state.estimate)) : "—",
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
  const displayed = computed(() => matches.value);
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
  const cellMeters = () => C.demInfo()?.cellMeters || 40;
  const checkStep = () => state.regional ? cellMeters() / 3 : Math.min(15, cellMeters() / 3);
  const regionalProfile = (grid) => ({
    angleStep: 6, rayStep: grid.source.sample_step_m,
    maxRange: Math.max(100000, grid.source.sample_step_m * 25),
    cameraHeight: 1.7, curvature: true,
  });
  const remove = (layer) => {
    if (layer && map) map.removeLayer(layer);
  };
  function inDem(p) {
    const v = C.latLngToLocal(p.lat, p.lng);
    return C.validDEMPoint(v.x, v.y);
  }
  function unitAt(p) {
    if (state.regional || !state.geologyAvailable) return;
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
    state.drawStatus = state.hasStart
      ? "從導航估計位置開始繪製，完成後檢查每一段。"
      : "請先設定起點，再繪製路線。";
  }
  function stop() {
    state.running = false;
    cancelAnimationFrame(frame);
  }
  let localizationTrigger;
  async function openLocalization(event) {
    localizationTrigger = event.currentTarget;
    state.localizationOpen = true;
    await nextTick();
    document.getElementById('close-localization')?.focus();
  }
  async function closeLocalization() {
    state.localizationOpen = false;
    await nextTick();
    const trigger = localizationTrigger?.getClientRects().length ? localizationTrigger : document.getElementById('open-localization');
    trigger?.focus();
    if (trigger?.id === 'open-localization') window.scrollTo(0,0);
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
    state.routeOptions = null;
    state.directRoute = null;
    remove(idealLayer);
    state.straightStatus = "請重新評估直線。";
    state.route = null;
    remove(routeLayer);
    routeLayer = null;
  }
  function reset(kind = state.scenario, { preserveTargets = false } = {}) {
    if (state.walk) {
      state.targets = state.targets.filter(t => !state.walk.stations.some(s => s.id === t.id));
      state.walk = null;
      state.stopIds = [];
      state.planner.roundTrip = false;
      state.hasStart = false;
      if (poiLayer) refreshPois();
    }
    state.pickingNoGo=false;
    if (!dem.value) return;
    stop();
    cancel();
    clearExpedition();
    // A task reset also removes user-created destinations and custom list filters.
    if (!preserveTargets) state.targets = state.targets.filter((target) => !target.id.startsWith("custom-"));
    state.destination = state.targets[0]?.id || "";
    state.targetName = "";
    state.query = "";
    state.type = "";
    state.selected = null;
    state.poi = null;
    state.slope = 15;
    state.layer = "none";
    state.layers = [];
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
    state.externalHorizon = false;
    observationPose = null;
    displayedCandidate = null;
    state.viewYaw = 0;
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
    if (!state.hasStart) {
      state.status = "尚未設定起點";
      state.message = "請先在「任務」選擇起點，再進行導航與地平線定位。";
      state.routeStatus = "請先在地圖選擇起點，再選終點並規劃路線。";
      state.drawStatus = "請先設定起點，再繪製路線。";
    }
    drawCurve();
    render();
  }
  function slopeValid() {
    const v = Number(state.slope);
    if (!Number.isFinite(v) || v < 1 || v > 45) {
      state.routeStatus = "坡度上限須介於 1–45°";
      return false;
    }
    const roughness = Number(state.roughnessLimit);
    if (!Number.isFinite(roughness) || roughness < 0 || roughness > 1) {
      state.routeStatus = '粗糙度上限須介於 0–1';
      return false;
    }
    C.setSlopeLimit(v);
    C.setRoughnessLimit(roughness);
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
        color: result.invalidSegments?.includes(i) ? "#ff736e" : C.terrainProduct(result.path[i].x,result.path[i].y)?.coarse ? "#e6b772" : "#8be4d0",
        weight: 4,
        pane: "navigationRoute",
        dashArray: C.terrainProduct(result.path[i].x,result.path[i].y)?.coarse ? "7 5" : null,
      }).addTo(routeLayer);
  }
  function redrawNoGoZones() {
    if (!map) return;
    noGoLayer?.clearLayers();
    if (!state.showNavigationRisk) return;
    for (const zone of state.noGoZones) {
      const ring=Array.from({length:64},(_,i)=>{
        const angle=i*Math.PI/32;
        const p=P.localToGeo(zone,Math.cos(angle)*zone.radius,Math.sin(angle)*zone.radius);
        return [p.lat,zone.lng+C.wrapRad((p.lng-zone.lng)*C.DEG)/C.DEG];
      });
      for(const offset of [-360,0,360]) L.polygon(ring.map(([lat,lng])=>[lat,lng+offset]),{pane:'navigationRisk',color:'#ff736e',weight:2,fillOpacity:.12,dashArray:'5 4',interactive:false}).addTo(noGoLayer);
    }
  }
  function rebuildNavigation() {
    if (!dem.value) return;
    try {
      C.setNavigationContext(createNavigationContext({options:state.navigation,zones:state.noGoZones,geologyIndex,thermal:navigationThermal,toGeo:(x,y)=>C.localToLatLng(x,y)}));
      state.navigationError='';
      state.navigationStatus = state.navigation.thermalEnabled
        ? (navigationThermal ? '熱慣量已接入導航（原始格網約 7.4 km／格）；與地質取較高倍率，不重複相乘。' : '熱慣量導航資料尚未就緒。')
        : '地質使用 Jezero 已接入圖幅；圖幅外採未知材質倍率。熱慣量修正未啟用。';
      syncNavigationRisk(true);
      redrawNoGoZones();
    } catch(error) { state.navigationError=error.message; }
  }
  async function loadNavigationThermal() {
    const token=++navigationLoadToken;
    if (!state.navigation.thermalEnabled || navigationThermal) {
      state.navigationLoading=false;
      rebuildNavigation(); return;
    }
    state.navigationLoading=true; state.navigationError='';
    try {
      const loaded=await scienceLoader.load('thermal');
      if(disposed || token!==navigationLoadToken)return;
      navigationThermal=loaded;
      rebuildNavigation();
    } catch(error) {
      if(!disposed && token===navigationLoadToken) state.navigationError=`熱慣量導航資料載入失敗：${error.message}；請重試或關閉熱慣量修正。`;
    } finally { if(!disposed && token===navigationLoadToken)state.navigationLoading=false; }
  }
  function beginNoGo() {
    if (state.pickingNoGo) { state.pickingNoGo=false; return; }
    if(!Number.isFinite(Number(state.noGoRadius)) || Number(state.noGoRadius)<10 || Number(state.noGoRadius)>100000) {
      state.routeStatus='禁行區半徑須介於 10–100,000 m'; return;
    }
    stop(); cancel(); stopDrawing();
    state.pickingStart=false; state.pickingTarget=false;
    state.pickingNoGo=true;
    state.routeStatus='請參照影像點選禁行區中心；半徑採火星公尺，不會自動辨識影像內容。';
  }
  function removeNoGo(id) { state.noGoZones=state.noGoZones.filter(z=>z.id!==id); }
  async function startWalk() {
    if (!state.ready || state.regionLoading || state.siteId !== 'jezero' || state.regional || state.walk) return;
    reset();
    const stations = snapshot.mission.targets.map(t => ({...t, note: '', outcome: '待觀察', scans: []}));
    state.walk = {stations, station: stations[0], at: 'base', includeB: true, decisionNote: '', elapsed: 0, completedLegs: [], comparison: null};
    missionStart = {...snapshot.mission.start};
    state.hasStart = true;
    state.targets.push(...stations);
    state.planner.roundTrip = true;
    state.stopIds = [stations[0].id];
    state.destination = stations[1].id;
    state.status = '基地起點已設定';
    state.message = '抵達科學站後可使用山頂相儀掃描。';
    state.selectedRoute = 'shortest';
    state.layer = 'thermal';
    state.tab = 'mission';
    state.panelOpen = true;
    refreshPois();
    await nextTick();
    if (!state.walk) return;
    plan();
    map.fitBounds(L.latLngBounds([ll(missionStart), ...stations.map(ll)]), {padding: [35,35], animate:false});
  }
  function focusWalkStation(station) {
    state.walk.station = station;
    map.panTo(ll(station), {animate:false});
  }
  function planWalkFromStation() {
    const w = state.walk;
    if (!w || w.at === 'base' || w.at === 'home') return;
    if (state.navigationLoading || state.navigationError || !slopeValid()) { clearRoute(); return; }
    stop(); cancel();
    const [a,b] = w.stations;
    const visitB = w.at === a.id && w.includeB;
    const home = {...missionStart, name:'返回基地', returnLeg:true};
    const work = w.stations.find(s => s.id === w.at);
    const spent = w.elapsed + (work.outcome === '略過' ? 0 : work.stopMinutes/60);
    try {
      const options = {...state.planner, roundTrip:false};
      const routes = buildItinerary(state.estimate, visitB ? [b,home] : [home], options);
      for (const r of new Set(Object.values(routes))) if (r.reachable) r.marginHours -= spent;
      installRoute(routes[state.selectedRoute]);
      state.routeOptions = routes;
      state.routeStatus = visitB ? '從目前估計加訪 B 並返程。' : '從目前估計返回基地。';
    } catch (err) { clearRoute(); state.routeStatus = err.message; }
  }
  function advanceWalk() {
    const w = state.walk, route = state.route;
    if (!w || !route?.reachable || w.at === 'home') return;
    const leg = route.legs[0], end = route.path[route.stopIndices[0]];
    stop(); cancel();
    const previous = w.stations.find(s => s.id === w.at);
    if (previous && previous.outcome !== '略過') w.elapsed += previous.stopMinutes/60;
    w.elapsed += leg.hours;
    w.completedLegs.push({ ...leg, path: route.path.slice(0, route.stopIndices[0]+1).map(p => {
      const {lat,lng} = C.localToLatLng(p.x,p.y);
      return [lng,lat,C.elevation(p.x,p.y)];
    }) });
    state.travelled += leg.length;
    const offset = {x:state.estimate.x-state.truth.x, y:state.estimate.y-state.truth.y};
    state.estimate = {x:end.x, y:end.y, heading:state.estimate.heading};
    state.truth = {x:end.x-offset.x, y:end.y-offset.y, heading:state.truth.heading};
    trail.addLatLng(ll(end));
    const station = w.stations.find(s => s.name === leg.name);
    w.at = station?.id || 'home';
    if (station) { focusWalkStation(station); planWalkFromStation(); }
    else { state.routeStatus = '已返回基地。'; map.panTo(ll(end)); }
    render();
  }
  function plan() {
    if (state.walk && state.walk.at !== 'base') return planWalkFromStation();
    if (state.navigationLoading || state.navigationError) { state.routeStatus=state.navigationError || '正在載入導航資料，請稍候。'; return; }
    if (!state.hasStart) return;
    if (state.regionLoading) return;
    stop();
    cancel();
    resetDrawing();
    if (!slopeValid()) return;
    const goal = state.targets.find((t) => t.id === state.destination);
    if (!goal) return;
    if (state.walk) state.walk.comparison = null;
    state.truth = { ...missionStart, heading: 45 };
    state.estimate = { ...missionStart, heading: 45 };
    state.travelled = 0;
    state.localizationCount = 0;
    lastScanDistance = -Infinity;
    trail.setLatLngs([ll(missionStart)]);
    let alternatives;
    try {
      const stops = state.stopIds.map(id => state.targets.find(t => t.id === id)).filter(Boolean);
      alternatives = buildItinerary(missionStart, [...stops, goal], state.planner);
      if (state.walk) {
        const [a,b] = state.walk.stations;
        const options = {...state.planner,roundTrip:true};
        state.walk.comparison = {
          a: !state.walk.includeB ? alternatives : buildItinerary(missionStart,[a],options),
          ab: state.walk.includeB ? alternatives : buildItinerary(missionStart,[a,b],options)
        };
      }
    } catch (error) {
      clearRoute();
      state.routeStatus = error.message;
      return;
    }
    const result = alternatives[state.selectedRoute];
    installRoute(result);
    state.routeOptions = alternatives;
    const n = Math.max(1, Math.ceil(C.distance(missionStart, goal) / checkStep()));
    const points = Array.from({ length: n + 1 }, (_, i) => ({
      x: missionStart.x + (goal.x - missionStart.x) * i / n,
      y: missionStart.y + (goal.y - missionStart.y) * i / n,
    }));
    const direct = routeCheck(points);
    state.directRoute = direct;
    const unknown = points.some(p => C.risk(p.x, p.y).unknown || !C.validDEMPoint(p.x, p.y));
    idealLayer = L.layerGroup().addTo(map);
    points.slice(1).forEach((p, i) => L.polyline([ll(points[i]), ll(p)], {
      color: direct.invalidSegments.includes(i + 1) ? "#ff736e" : "#f2ed48",
      pane: "navigationRoute", weight: 3, dashArray: "7 6", interactive: false,
    }).addTo(idealLayer));
    state.straightStatus = `理想直線 ${fmt(direct.length)} · 最大坡度 ${direct.maxSlope.toFixed(1)}° · ` +
      (direct.reachable ? "通過 DEM 檢查" : `${unknown ? "缺測或越界；" : ""}${direct.maxSlope > Number(state.slope) ? "超過坡度上限；" : ""}紅色路段不可通行，請沿青色建議路線繞行。`);
    state.continuousLocalization = true;
    render();
    state.routeStatus = result.reachable
      ? `已建立${{safer:'較低風險',shortest:'最短',energy:'最低耗電'}[state.selectedRoute]}路線 · ${result.legs.length} 段${result.molaDistance ? ` · MOLA 粗略區段 ${fmt(result.molaDistance)}` : ''} · 可切換比較後行進`
      : `無法抵達「${result.failedStop || goal.name}」，請調整停靠點或避險門檻。`;
  }
  function selectRoute(key) {
    if (!state.routeOptions || !['shortest','safer','energy'].includes(key)) return;
    if (state.walk && state.walk.at !== 'base') {
      state.selectedRoute = key;
      return planWalkFromStation();
    }
    stop(); cancel();
    const alternatives = state.routeOptions, direct = state.directRoute;
    state.selectedRoute = key;
    state.truth = { ...missionStart, heading: 45 };
    state.estimate = { ...missionStart, heading: 45 };
    state.travelled = 0;
    trail.setLatLngs([ll(missionStart)]);
    installRoute(alternatives[key]);
    state.routeOptions = alternatives;
    state.directRoute = direct;
    state.routeStatus = alternatives[key].reachable ? '已切換路線並返回規劃起點。' : '此方案無可達路線。';
    nextTick(drawProfile);
    render();
  }
  function addStop() {
    if (!state.destination || state.stopIds.includes(state.destination)) return;
    state.stopIds.push(state.destination);
    state.destination = '';
  }
  function moveStop(index, delta) {
    const next = index+delta;
    if (next < 0 || next >= state.stopIds.length) return;
    [state.stopIds[index],state.stopIds[next]] = [state.stopIds[next],state.stopIds[index]];
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
    if (!state.hasStart || !state.route?.reachable) return;
    cancel();
    state.running = true;
    lastTime = null;
    if (state.continuousLocalization) scan(true);
    frame = requestAnimationFrame(motion);
  }
  function drift() {
    if (!state.hasStart) return;
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
  function scan(continuous = false, suppliedObservation = null) {
    if (!state.hasStart && !suppliedObservation) return;
    if (!state.ready || state.regionLoading) return;
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
    observationPose = { ...(suppliedObservation ? state.estimate : state.truth) };
    displayedCandidate = null;
    state.viewYaw = 0;
    state.externalHorizon = !!suppliedObservation;
    observation = suppliedObservation || S.simulate(observationPose, {
      ...profileOptions,
      seed: 42,
      noise: 0.025,
      fov: state.scenario === "good" ? 360 : 60,
      occlusion: state.scenario === "good" ? 0 : 0.55,
    });
    drawCurve();
    render();
    const centre = { ...state.estimate },
      range = state.regional ? Math.max(16000, cellMeters() * 4) : 1600,
      searchBounds = suppliedObservation && !state.hasStart ? {
        minX: C.LIMIT.minX + 250, maxX: C.LIMIT.maxX - 250,
        minY: C.LIMIT.minY + 250, maxY: C.LIMIT.maxY - 250,
      } : {
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
      suppliedObservation ? "使用手繪／照片角度輪廓搜尋 DEM 候選；不自動套用校正。" : "輸入只有地平線曲線與估計位置周邊搜尋區；模擬真值不傳入定位器。";
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
          color: i ? "#f2ed48" : "#7fe9d4",
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
      if (state.walk) {
        const station = state.walk.stations.find(s => s.id === state.walk.at);
        station?.scans.push({source:suppliedObservation ? '照片／手繪候選':'同 DEM 模擬',
          coverageDegrees:360*observation.valid.filter(Boolean).length/observation.valid.length,
          scenario:suppliedObservation ? null : state.scenario,status:result.status,reason:result.reason,
          updated:!suppliedObservation && !state.regional && result.status === 'good' && !!best});
      }
      if (suppliedObservation) {
        state.status = "外部輪廓候選";
        state.message = `${result.reason}；手繪／照片比對僅提供候選，請核對橘色輸入與青色 DEM 輪廓及相機設定。未套用位置校正。`;
        state.evaluation = "外部觀測沒有模擬真值可評估。";
      } else if (result.status === "good" && best) {
        // Search describes the capture instant; carry intervening odometry forward.
        state.estimate = {
          x: best.x + (continuous ? state.estimate.x - capturePose.x : 0),
          y: best.y + (continuous ? state.estimate.y - capturePose.y : 0),
          heading: C.modDeg(best.heading + (continuous
            ? state.estimate.heading - capturePose.heading : 0)),
        };
        state.localizationCount++;
        if (!continuous && state.walk && state.walk.at !== 'base') planWalkFromStation();
        else if (!continuous) clearRoute();
        else {
          const goal = state.targets.find(t => t.id === state.destination);
          if (goal) {
            const current = state.route;
            const pending = current?.stopIndices
              ? current.stopIndices.filter(index => index > waypoint).map(index => current.path[index])
              : [goal];
            const remaining = buildItinerary(state.estimate, pending.length ? pending : [goal], { ...state.planner, roundTrip: false })[state.selectedRoute];
            // Preserve the ideal baseline while updating only the remaining route.
            const baseline = idealLayer, status = state.straightStatus, alternatives = state.routeOptions;
            idealLayer = null;
            installRoute(remaining);
            state.routeOptions = alternatives;
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
      options: suppliedObservation && !state.hasStart
        ? { coarseStep: Math.max(state.regional ? cellMeters() : 200,
            (searchBounds.maxX - searchBounds.minX) / 24, (searchBounds.maxY - searchBounds.minY) / 24),
            candidateSeparation: state.regional ? cellMeters() * 2 : 180 }
        : state.regional ? { coarseStep: cellMeters(), candidateSeparation: cellMeters() * 2 } : {},
    });
  }
  function drawCurve(candidate) {
    displayedCandidate = candidate;
    const cv = curve.value;
    if (!cv) return;
    const ctx = cv.getContext("2d"),
      w = cv.width,
      h = cv.height;
    ctx.clearRect(0, 0, w, h);
    if (!observation) return;
    const obs = observation,
      view = S.viewport(obs, state.viewYaw),
      p = candidate ? S.profile(candidate, obs.options) : null,
      vals = obs.elevations
        .filter((v, i) => obs.valid[i] && Number.isFinite(v));
    if (!vals.length) return;
    const lo = Math.min(...vals) - 0.3,
      hi = Math.max(...vals) + 0.3;
    ctx.fillStyle = "#15232a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#c9d5d5";
    ctx.font = "12px system-ui";
    ctx.fillText(
      `觀測（橘）／候選（青） · 同上方 120° · 仰角 ${lo.toFixed(1)}–${hi.toFixed(1)}°`,
      12,
      18,
    );
    function line(values, valid, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let open = false;
      view.forEach(({ index: i }, column) => {
        const v = values[i];
        if (!valid[i] || !Number.isFinite(v)) {
          open = false;
          return;
        }
        const x = (column / (view.length - 1)) * w,
          y = 30 + ((hi - v) / (hi - lo)) * (h - 45);
        if (open) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
        open = true;
      });
      ctx.stroke();
      // Isolated valid rays remain visible without bridging missing observations.
      view.forEach(({ index: i }, column) => {
        if (!valid[i] || !Number.isFinite(values[i])) return;
        ctx.fillStyle = color;
        ctx.fillRect(column / (view.length - 1) * w - 1.5,
          30 + ((hi - values[i]) / (hi - lo)) * (h - 45) - 1.5, 3, 3);
      });
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
        valid.push(obs.valid[i] && Number.isFinite(obs.elevations[i]) && p.valid[j] && p.valid[k]);
      }
      line(values, valid, "#82e6d2");
    }
  }
  function render() {
    clearHorizonHover();
    panoramaFrame = null;
    if (!dem.value || !map) return;
    if (!state.hasStart && !state.externalHorizon) {
      remove(estimateMarker);
      remove(truthMarker);
      for (const cv of [panorama.value, curve.value]) {
        if (cv) cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      }
      return;
    }
    scope();
    estimateMarker.setLatLng(ll(state.estimate));
    truthMarker.setLatLng(ll(state.truth));
    const cv = panorama.value;
    if (!cv) return;
    const W = cv.width,
      H = cv.height,
      ctx = cv.getContext("2d"),
      pose = observationPose || state.truth,
      obs = observation || S.simulate(pose, {
        ...profileOptions, seed: 42, noise: 0.025,
        fov: state.scenario === "good" ? 360 : 60,
        occlusion: state.scenario === "good" ? 0 : 0.55,
      }),
      view = S.viewport(obs, state.viewYaw),
      heading = C.modDeg(pose.heading + state.viewYaw),
      validValues = obs.elevations.filter((v, i) => obs.valid[i] && Number.isFinite(v)),
      lo = validValues.length ? Math.min(...validValues) - 0.3 : -1,
      hi = validValues.length ? Math.max(...validValues) + 0.3 : 1,
      screenY = (angle) => 40 + (hi - angle) / (hi - lo) * (H - 60);
    panoramaFrame = { pose, obs, view, screenY, captured: !!observation };
    ctx.fillStyle = "#a68470";
    ctx.fillRect(0, 0, W, H);
    const dx = W / (view.length - 1);
    view.forEach((sample, i) => {
      const x = i * dx;
      if (!sample.valid) {
        ctx.fillStyle = '#26343c';
        ctx.fillRect(x - dx / 2, 30, dx, H - 30);
        return;
      }
      const y = screenY(sample.elevation), next = view[i + 1];
      ctx.fillStyle = '#553d36';
      ctx.fillRect(x - dx / 2, y, dx, H - y);
      ctx.strokeStyle = '#ffb477';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      if (next?.valid) ctx.lineTo(x + dx, screenY(next.elevation));
      else ctx.lineTo(x + 1, y);
      ctx.stroke();
    });
    const eye = C.elevation(pose.x, pose.y) + obs.cameraHeight;
    const markers = state.externalHorizon ? [] : [...state.pois, ...state.targets];
    const seen = new Set();
    const labels = [];
    for (const marker of markers) {
      if (seen.has(marker.id)) continue;
      seen.add(marker.id);
      const distance = C.distance(pose, marker);
      const z = C.elevation(marker.x, marker.y);
      if (!Number.isFinite(z) || distance < 1) continue;
      const bearing = C.modDeg(Math.atan2(marker.x - pose.x, marker.y - pose.y) / C.DEG);
      const delta = ((bearing - heading + 540) % 360) - 180;
      const selected = marker.id === state.destination || marker.id === state.poi?.id;
      if (Math.abs(delta) > 60 && !selected) continue;
      const drop = (d) => profileOptions?.curvature ? d * d / (2 * C.R) : 0;
      const angle = Math.atan2(z - eye - drop(distance), distance) / C.DEG;
      let hidden = false;
      const step = Math.max(40, distance / 100);
      for (let d = step; d < distance - step / 2; d += step) {
        const t = d / distance;
        const terrain = C.elevation(pose.x + (marker.x - pose.x) * t, pose.y + (marker.y - pose.y) * t);
        if (!Number.isFinite(terrain) || terrain - drop(d) > eye + (z - eye - drop(distance)) * t + 1) {
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
      const y = C.clamp(screenY(angle), 65, H - 32);
      const text = `${outside ? (delta < 0 ? '◀ ' : '▶ ') : ''}${marker.name} · ${fmt(distance)}${outside ? ' · 地圖投影／視野外' : hidden ? ' · 地圖投影／不可見' : ''}`;
      ctx.font = `${selected ? 'bold ' : ''}12px system-ui`;
      const width = Math.min(W - 16, ctx.measureText(text).width + 16);
      const left = C.clamp(x - width / 2, 8, W - width - 8);
      let row = 0;
      while (row < 3 && occupied.some((v) => v.row === row && left < v.right + 6 && left + width > v.left - 6)) row++;
      if (row === 3) continue;
      occupied.push({ row, left, right: left + width });
      const top = 34 + row * 25;
      const color = selected ? '#82e6d2' : '#f2ed48';
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
      if (hidden || outside) ctx.stroke();
      else ctx.fill();
    }
    ctx.fillStyle = "#fff0d6";
    ctx.font = "13px system-ui";
    ctx.fillText(state.externalHorizon ? `使用者輪廓 · 相對視角 ${state.viewYaw.toFixed(0)}° · 深色區無觀測` : `${observation ? '掃描快照' : '掃描前預覽'} · yaw ${heading.toFixed(0)}° · 深色區無觀測`, 12, 22);
  }
  function clearHorizonHover() {
    horizonHoverLayer?.clearLayers();
    hoveredHorizonIndex = null;
    state.horizonHover = "";
  }
  function leaveHorizon() {
    clearHorizonHover();
    render();
  }
  function hoverHorizon(event) {
    if (state.externalHorizon) { state.horizonHover = "外部輪廓尚未確定拍攝位置，請查看地圖候選與青色 DEM 疊圖。"; return; }
    if (!panoramaFrame?.captured || !map || !horizonHoverLayer) return;
    const cv = panorama.value, rect = cv.getBoundingClientRect();
    const fraction = C.clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const column = Math.round(fraction * (panoramaFrame.view.length - 1));
    if (column === hoveredHorizonIndex) return;
    render();
    const { pose, obs, view, screenY } = panoramaFrame, sample = view[column];
    hoveredHorizonIndex = column;
    if (!sample.valid) {
      state.horizonHover = "此方向無有效觀測，無法標示輪廓點。";
      return;
    }
    const bearing = C.modDeg(pose.heading + obs.angles[sample.index]);
    const point = S.horizonPoint(pose, bearing, obs.options);
    if (!point) return;
    const label = `輪廓點 · 方位 ${bearing.toFixed(0)}° · 距掃描位置 ${fmt(point.distance)} · 高程 ${point.z.toFixed(0)} m`;
    L.polyline([ll(pose), ll(point)], {
      color: '#ffb477', weight: 2, dashArray: '5 5', interactive: false,
    }).addTo(horizonHoverLayer);
    L.circleMarker(ll(point), {
      radius: 7, color: '#ffffff', weight: 2, fillColor: '#ffb477',
      fillOpacity: 1, interactive: false, className: 'horizon-hover-point',
    }).addTo(horizonHoverLayer).bindTooltip(label, {
      permanent: true, direction: 'top', offset: [0, -9],
    });
    const ctx = cv.getContext('2d'), x = column / (view.length - 1) * cv.width;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, cv.height); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(x, screenY(sample.elevation), 5, 0, Math.PI * 2); ctx.stroke();
    state.horizonHover = label;
  }
  function terrainImage(kind) {
    const cv = document.createElement("canvas");
    cv.width = Math.min(601, dem.value.width);
    cv.height = Math.min(601, dem.value.height);
    const finite = dem.value.heights.filter(Number.isFinite);
    const low = finite.reduce((a,b)=>Math.min(a,b),Infinity), high = finite.reduce((a,b)=>Math.max(a,b),-Infinity);
    const ctx = cv.getContext("2d"),
      img = ctx.createImageData(cv.width, cv.height);
    for (let j = 0; j < cv.height; j++)
      for (let i = 0; i < cv.width; i++) {
        const x =
            C.LIMIT.minX + (i / (cv.width - 1)) * (C.LIMIT.maxX - C.LIMIT.minX),
          y =
            C.LIMIT.maxY -
            (j / (cv.height - 1)) * (C.LIMIT.maxY - C.LIMIT.minY),
          z = kind === "slope" ? C.slopeDeg(x, y) : kind === "roughness" ? C.roughness(x,y) : C.elevation(x, y),
          v =
            kind === "slope"
              ? C.clamp(z / 30, 0, 1)
              : kind === "roughness" ? z : C.clamp((z-low)/Math.max(1,high-low),0,1),
          k = (j * cv.width + i) * 4;
        img.data[k] = 50 + 200 * v;
        img.data[k + 1] = 115 + 70 * v;
        img.data[k + 2] = 130 - 50 * v;
        img.data[k + 3] = Number.isFinite(z) ? 210 : 0;
        if(kind === "hillshade") {
          const h=cellMeters(), gx=(C.elevation(x+h,y)-C.elevation(x-h,y))/(2*h), gy=(C.elevation(x,y+h)-C.elevation(x,y-h))/(2*h);
          const light=Math.max(0,(-gx*-.5-gy*.5+Math.SQRT1_2)/Math.hypot(gx,gy,1));
          img.data[k]=img.data[k+1]=img.data[k+2]=255*light;
          img.data[k+3]=Number.isFinite(light)?230:0;
        }
      }
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL();
  }
  function analysisPane(kind) {
    const pane = map.getPane('analysis-' + kind) || map.createPane('analysis-' + kind);
    pane.style.zIndex = 401 + state.layers.indexOf(kind);
    pane.style.pointerEvents = 'none';
    return 'analysis-' + kind;
  }
  async function setScienceLayer(kind, token) {
    const scienceOverlay = L.layerGroup().addTo(analysis);
    const record = reactive({ overlay: markRaw(scienceOverlay), meta: null, values: null, loading: true, status: '正在載入離線科學資料…', range: null });
    state.scienceLayers[kind] = record;
    const layerPane = analysisPane(kind);
    try {
      const loaded = await scienceLoader.load(kind);
      if (disposed || token !== scienceToken || !state.layers.includes(kind)) return;
      const meta = loaded.meta;
      record.values = loaded.values;
      record.meta = meta;
      const style = state.layerStyles[kind];
      if (meta.kind === 'raster') {
        const validRange = Number.isFinite(style.min) && Number.isFinite(style.max) && style.min < style.max;
        const [min, max] = validRange ? [Number(style.min), Number(style.max)] : meta.scale;
        record.range = [min, max];
        const url = colorizeScienceGrid(loaded.values, meta.width, meta.height, min, max, style.palette);
        for (const offset of [-360, 0, 360]) {
          const overlay = L.imageOverlay(url, [[-90,-180+offset],[90,180+offset]], {
            pane: layerPane, opacity: style.opacity / 100, className: 'science-raster', interactive: false,
          });
          overlay.on('error', () => {
            if (token === scienceToken) record.status = '科學疊圖影像載入失敗，請重試。';
          });
          overlay.addTo(scienceOverlay);
        }
        if (state.layer === kind) state.legend = `${meta.title} · ${min} 至 ${max} ${meta.unit} · 缺值透明；色階外數值截色`;
        record.status = `已疊加下載格網 · ${360/meta.width}°／格；放大不增加原始解析度。`;
      } else {
        for (const offset of [-360,0,360]) {
          L.circleMarker([meta.lat, meta.lng+offset], { pane: layerPane, radius: 9, color: '#ffe09a', weight: 2, opacity: style.opacity / 100, fillColor: kind === 'radiation' ? '#d24132' : '#2ab4b4', fillOpacity: style.opacity / 100 })
            .bindTooltip(esc(`${meta.name} · ${meta.value.toFixed(2)} ${meta.unit}`))
            .bindPopup(`<strong>${esc(meta.name)}</strong><p>${esc(meta.value.toFixed(2))} ${esc(meta.unit)}</p><p>${esc(meta.note)}</p>`)
            .addTo(scienceOverlay);
        }
        if (state.layer === kind) state.legend = `${meta.name} · ${meta.value.toFixed(2)} ${meta.unit} · 歷史測站，非整區格網`;
        record.status = '已疊加實際觀測測站；可查看測站位置與原表。';
      }
      estimateMarker?.bringToFront();
    } catch (error) {
      if (token !== scienceToken || disposed) return;
      record.status = `科學圖層載入失敗：${error.message}`;
      if (state.layer === kind) state.legend = '此圖層未載入；可重試。';
    } finally {
      if (token === scienceToken && !disposed) record.loading = false;
    }
  }
  function setLayer() {
    const token = ++scienceToken;
    state.scienceLayers = {};
    if (!map || !dem.value) return;
    remove(analysis);
    analysis = L.layerGroup().addTo(map);
    state.units = [];
    syncBasemap();
    for (const kind of state.layers) renderLayer(kind, token);
    if (!state.layers.length) renderLayer('none', token);
  }
  function renderLayer(kind, token) {
    const pane = analysisPane(kind);
    const opacity = (state.layerStyles[kind]?.opacity ?? 65) / 100;
    if (scienceLayerIds.includes(kind)) {
      state.legend = '正在載入科學疊圖…';
      setScienceLayer(kind, token);
      return;
    }
    if (state.globalView && ['none', 'terrain'].includes(kind)) {
      state.legend = kind === 'terrain' || !state.optical
        ? 'MOLA 全球高程與地形陰影 · −8,200 至 21,800 m；游標讀取 16 ppd 數值高程'
        : 'USGS Viking 全球彩色光學拼圖 · 展示約 10.4 km/pixel；非即時影像';
      return;
    }
    if (kind === "geology") {
      if (state.regional || !state.geologyAvailable) {
        state.legend = "此區尚無已接入的地質單元圖；不套用 Jezero 地質分類。";
        return;
      }
      const seen = new Set();
      L.layerGroup(
        geology.features.map((f) => {
          const color = `rgb(${(unitStyle(f)?.symbol?.color || [150, 150, 150]).slice(0, 3).join(",")})`,
            label = unitLabel(f);
          if (!seen.has(label)) {
            seen.add(label);
            state.units.push({ label, color });
          }
          return L.polygon(
            f.rings.map((r) => r.map(([x, y]) => ll({ x, y }))),
            { pane, color, weight: 1, opacity, fillOpacity: opacity * 0.85 },
          ).bindTooltip(esc(label));
        }),
      ).addTo(analysis);
      state.legend = "USGS Sun & Stack 2020 · 1:75,000";
    } else if (kind !== "none") {
      if (state.regional) {
        const regionalLayer = L.layerGroup().addTo(analysis);
        for (let j = 2; j < dem.value.height - 2; j += 4)
          for (let i = 2; i < dem.value.width - 2; i += 4) {
            const p = {
                x: dem.value.xMin + i * cellMeters(),
                y: dem.value.yMax - j * cellMeters(),
              },
              v =
                kind === "slope" ? C.slopeDeg(p.x, p.y) : C.elevation(p.x, p.y),
              f =
                kind === "slope"
                  ? C.clamp(v / 24, 0, 1)
                  : C.clamp((v + 8200) / 30000, 0, 1);
            L.circleMarker(ll(p), {
              pane, radius: 4,
              color: `hsl(${220 - f * 220} 65% 60%)`,
              weight: 0,
              fillOpacity: opacity,
            })
              .bindTooltip(
                `${v.toFixed(1)} ${kind === "slope" ? "°" : "m"} · MOLA 衍生`,
              )
              .addTo(regionalLayer);
          }
        state.legend = "MOLA 區域取樣點；無法解析近距離障礙物。";
      } else {
        L.imageOverlay(terrainImage(kind), bounds, {
          opacity,
          pane, className: 'local-dem-image',
        }).addTo(analysis);
        state.legend =
          kind === "slope"
            ? "0–30° 坡度 · DEM 衍生；缺值透明"
            : kind === "hillshade" ? "DEM 衍生陰影 · 西北光源、高度角 45°；非照片" : kind === "roughness" ? "DEM 衍生粗糙度指標 0–1；非車輪尺度實測" : "依目前 DEM 最小／最大高程縮放色階";
      }
    } else
      state.legend = state.regional
        ? (state.optical ? "USGS Viking 全球彩色光學拼圖 · 展示約 10.4 km/pixel；非即時影像" : "MOLA 全球地形陰影 · 16 ppd，赤道約 3.7 km/格")
        : !state.optical ? "光學影像關閉 · 背景為 MOLA 全球地形陰影"
        : state.siteId === "gale" ? "USGS HiRISE 正射影像 · 展示約 6.67 m/pixel；約 51.5% 彩色，其餘灰階補足，非地質分區" : "CTX 光學影像 · 原生約 5 m；擴區完整影像展示約 20 m/pixel";
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
        color: "#f2ed48",
        interactive: false,
      }).addTo(preview),
    );
    state.drawStatus = `已繪製 ${state.points.length} 個點；起點為導航估計位置。`;
  }
  function beginDrawing(mode) {
    state.pickingNoGo=false;
    if (!state.hasStart) return;
    if (!dem.value || state.regionLoading) return;
    stop();
    cancel();
    resetDrawing();
    clearRoute();
    map.closePopup();
    map.fitBounds(bounds, { animate: false });
    state.drawMode = mode;
    state.pickingStart = false;
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
      const n = Math.max(1, Math.ceil(d / checkStep()));
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
  async function finishDrawing() {
    if (state.regionLoading || state.points.length < 2 || !slopeValid()) return;
    const outside = state.points.find(p => !C.validDEMPoint(p.x, p.y) || C.risk(p.x, p.y).unknown);
    if (outside && !(await coverTarget(C.localToLatLng(outside.x, outside.y)))) return;
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
    if (state.walk?.stations.some(t => t.id === p.id)) focusWalkStation(p);
    else if (state.targets.some((t) => t.id === p.id)) state.destination = p.id;
    map.panTo(ll(p));
    const r = C.risk(p.x, p.y);
    L.popup()
      .setLatLng(ll(p))
      .setContent(
        `<strong>${esc(p.name)}</strong><p>${esc(p.kind)}</p><p>${esc(p.status || p.science || "")}</p><p>${r.unknown ? "缺測／未知" : r.blocked ? "超過導航避險門檻" : "DEM 可通行"} · 高程 ${C.elevation(p.x, p.y).toFixed(1)} m</p><p>${esc(unitLabel(unitAt(p)))}</p>`,
      )
      .openOn(map);
  }
  function beginTarget() {
    state.pickingNoGo=false;
    if (state.regionLoading) return;
    state.pickingStart = false;
    if (!state.ready) return;
    stop();
    resetDrawing();
    state.pickingTarget = !state.pickingTarget;
    state.routeStatus = state.pickingTarget
      ? "請在地圖選取位置；局部 DEM 有效處優先，近區域越界處合併使用 MOLA。"
      : "已取消新增目的地。";
  }
  async function coverTarget(geo) {
    if (inDem(geo)) {
      const p = C.latLngToLocal(geo.lat, geo.lng);
      if (!C.risk(p.x, p.y).unknown) return true;
    }
    if (!state.regional) {
      const p=C.latLngToLocal(geo.lat,geo.lng);
      if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||Math.hypot(p.x,p.y)>200000){
        state.regionStatus="此位置距離局部 DEM 超過 200 km；請建立獨立的 MOLA 區域任務。";
        state.routeStatus=state.regionStatus;
        return false;
      }
      if(state.regionLoading)return false;
      state.regionLoading=true;
      state.regionStatus="載入 MOLA 數值高程，與目前局部 DEM 合併導航…";
      try{
        const planet=await loadPlanet();
        const localCenter=C.localToLatLng(0,0);
        const anchor=C.demAt(0,0);
        const offset=Number.isFinite(anchor)?anchor-planet.sample(localCenter.lat,localCenter.lng):0;
        const extent={minX:Math.min(C.LIMIT.minX,p.x-8000),maxX:Math.max(C.LIMIT.maxX,p.x+8000),minY:Math.min(C.LIMIT.minY,p.y-8000),maxY:Math.max(C.LIMIT.maxY,p.y+8000)};
        C.setMolaFallback((x,y)=>{const q=C.localToLatLng(x,y);return planet.sample(q.lat,q.lng)+offset;},extent,4000);
        bounds=[ll({x:extent.minX,y:extent.minY}),ll({x:extent.maxX,y:extent.maxY})];
        state.regionStatus="局部 DEM 與 MOLA 已合併：局部 DEM 優先，缺測或越界處採用公里級 MOLA；MOLA 區段無法評估小型障礙。";
        state.routeStatus=state.regionStatus;
        scope();
        return !C.risk(p.x,p.y).unknown;
      }catch(e){state.regionStatus="MOLA 載入失敗："+e.message;state.routeStatus=state.regionStatus;return false;}
      finally{state.regionLoading=false;}
    }
    if (state.regionLoading) return false;
    const token = ++regionToken;
    const start = C.localToLatLng(missionStart.x, missionStart.y);
    const truth = { ...state.truth, ...C.localToLatLng(state.truth.x, state.truth.y) };
    const estimate = { ...state.estimate, ...C.localToLatLng(state.estimate.x, state.estimate.y) };
    const targets = state.targets.map(t => ({ ...t, ...C.localToLatLng(t.x, t.y) }));
    const drawing = state.points.map(p => C.localToLatLng(p.x, p.y));
    const mode = state.drawMode, pickingStart = state.pickingStart, pickingTarget = state.pickingTarget;
    const destination = state.destination, travelled = state.travelled, hasStart = state.hasStart;
    const history = trail.getLatLngs();
    const name = state.targetName;
    const points = [start, truth, estimate, ...targets, ...drawing, geo];
    const origin = P.coverageOrigin(points);
    stop(); cancel();
    state.regionLoading = true;
    state.regionStatus = "正在擴大 MOLA 覆蓋範圍，保留起點與目的地…";
    try {
      const planet = await loadPlanet();
      if (disposed || token !== regionToken) return false;
      const grid = planet.region(origin.lat, origin.lng, points);
      C.setDEM(grid);
      dem.value = grid;
      state.regional = true;
      missionStart = C.latLngToLocal(start.lat,start.lng);
      state.siteId = "mola";
      state.siteName = "MOLA";
      state.geologyAvailable = false;
      profileOptions = regionalProfile(grid);
      refreshMission();
      // refreshMission resets custom destinations; restore them in the new frame afterwards.
      state.hasStart = hasStart;
      state.targets = targets.map(t => ({...t,...C.latLngToLocal(t.lat,t.lng),unit:"MOLA 區域地形"}));
      refreshPois();
      state.truth = {...truth,...C.latLngToLocal(truth.lat,truth.lng)};
      state.estimate = {...estimate,...C.latLngToLocal(estimate.lat,estimate.lng)};
      trail.setLatLngs(history);
      state.travelled = travelled;
      state.destination = destination;
      state.points = drawing.map(p => C.latLngToLocal(p.lat, p.lng));
      state.drawMode = mode;
      if (mode) {
        if (mode === "freehand") map.dragging.disable();
        map.doubleClickZoom.disable();
        drawPreview();
      }
      state.targetName = name;
      state.pickingStart = pickingStart;
      state.pickingTarget = pickingTarget;
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
  async function addNamedTarget(place, mode = 'stop') {
    if (!state.ready || state.regionLoading || !place || !['stop','destination'].includes(mode)) return;
    const id = 'custom-named-' + encodeURIComponent(place.name);
    const previousDestination = state.destination;
    const slope = state.slope, roughness = state.roughnessLimit;
    state.namedTargetStatus = `正在加入「${place.zh || place.name}」…`;
    if (!state.targets.some(t => t.id === id)) {
      if (!(await coverTarget({lat:place.lat,lng:place.lng}))) {
        state.namedTargetStatus = `加入失敗：${state.regionStatus}`;
        return;
      }
      state.slope = slope;
      state.roughnessLimit = roughness;
      const point = C.latLngToLocal(place.lat,place.lng);
      if (!C.validDEMPoint(point.x,point.y)) {
        state.namedTargetStatus = '此地名中心缺少高程資料，無法加入；可在附近另選目的地。';
        return;
      }
      state.targets.push({...point,id,name:place.zh || place.name,officialName:place.name,
        source:place.url,lat:place.lat,lng:place.lng,kind:place.kind || 'IAU 正式地名目錄中心',
        unit:state.regional ? 'MOLA 區域地形' : unitLabel(unitAt(point))});
    }
    stop(); cancel(); clearRoute();
    if (mode === 'stop') {
      if (!state.stopIds.includes(id)) state.stopIds.push(id);
      state.destination = previousDestination === id ? '' : previousDestination;
    } else {
      state.stopIds = state.stopIds.filter(stopId => stopId !== id);
      state.destination = id;
    }
    state.pickingTarget = false;
    state.pickingStart = false;
    refreshPois();
    state.namedTargetStatus = `已將「${place.zh || place.name}」加入${mode === 'stop' ? '停靠順序' : '終點'}；位置採${place.kind ? '歷史著陸座標' : '地名目錄中心'}，規劃時會檢查是否可達。`;
    state.routeStatus = state.namedTargetStatus;
    state.tab = 'mission'; state.panelOpen = true;
  }
  function addTarget(p) {
    if (!state.pickingTarget) return;
    if (!C.validDEMPoint(p.x, p.y)) {
      state.routeStatus = "此位置超出有效高程範圍，請在區域內重新選點。";
      return;
    }
    const target = {
      ...p,
      id: createUiId("custom-"),
      name: state.targetName.trim() || "自訂目的地 " + (state.targets.length + 1),
      unit: state.regional ? "MOLA 區域地形" : unitLabel(unitAt(p)),
      kind: "使用者自訂目的地",
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
    state.routeStatus = "已刪除目的地，請選擇或新增目的地。";
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
      ...(state.regional || state.siteId !== "jezero" ? [] : [landing]),
      ...C.FEATURES.map((p) => ({
        ...p,
        kind: "DEM 自動候選峰（非正式地名）",
      })),
    ];
    for (const p of [...state.pois, ...state.targets.filter((p) => p.id.startsWith("custom-") || state.walk?.stations.some(t => t.id === p.id)), ...(state.walk ? [{...missionStart,id:"base",name:"任務基地",kind:"擬定人類任務"}] : [])])
      L.circleMarker(ll(p), {
        radius: p.id.startsWith("P") ? 4 : 6,
        color: "#f2ed48",
        fillOpacity: 0.8,
      })
        .addTo(poiLayer)
        .bindTooltip(esc(p.name), { permanent: !!state.walk && (p.id === 'base' || state.walk.stations.some(t => t.id === p.id)), direction: 'top' })
        .on("click", () => selectPoi(p));
  }
  function filterNames() {
    if (!namesLayer) return;
    namesLayer.clearLayers();
    const points = map.getZoom() < 4 && !state.query && !state.type
      ? displayed.value.filter(p => p.featured) : displayed.value;
    for (const p of points)
      L.circleMarker([p.lat, p.lng], {
        radius: p.featured ? 6 : 4,
        color: "#f2ed48",
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
  function syncNavigationRisk(redraw = false) {
    if (!navigationOverlay) return;
    if (state.showNavigationRisk && !state.globalView && slopeValid()) {
      navigationOverlay.addTo(map);
      if (redraw) navigationOverlay.redraw();
    } else remove(navigationOverlay);
  }
  function syncBasemap() {
    globalBase?.eachLayer(layer => layer.setUrl(asset(
      state.optical && !state.layers.includes('terrain') ? 'data/mars-global-optical.jpg' : 'data/mars-global-dem.jpg'
    )));
  }
  function scope() {
    if (!dem.value) return;
    if (regionalOverview && map.getZoom() >= 4) regionalOverview = false;
    const c = map.getCenter(),
      isLocal = (state.regional && !regionalOverview) || (!state.regional &&
        inDem({ lat: c.lat, lng: c.lng }) &&
        map.getZoom() >=
          8);
    const changed = state.globalView !== !isLocal;
    state.globalView = !isLocal;
    if (changed) {
      if (state.globalView) overviewHeights();
      if (state.globalView) {
        state.layers = state.layers.filter(id => !['slope', 'hillshade', 'roughness', 'geology'].includes(id));
        state.layer = state.layers.at(-1) || 'none';
      }
      setLayer();
    }
    for (const layer of [estimateMarker, trail, routeLayer, poiLayer]) {
      if (!layer) continue;
      if (isLocal && (layer === poiLayer || state.hasStart)) layer.addTo(map);
      else remove(layer);
    }
    if (isLocal && state.hasStart && state.truthVisible) truthMarker.addTo(map);
    else remove(truthMarker);
    syncNavigationRisk();
    state.mapTitle = isLocal
      ? state.regional
        ? `MOLA 區域 / ${dem.value.origin.lat.toFixed(2)}°, ${dem.value.origin.lng.toFixed(2)}°`
        : `${state.siteName} / ${C.LAT0.toFixed(2)}°, ${C.LON0.toFixed(2)}°`
      : "火星全球總覽";
    state.mapContext = isLocal
      ? state.regional
        ? (inDem(c) ? `MOLA 格距 ${fmt(cellMeters())} · 未校準定位` : "視野中心超出任務 DEM · 選點與路線將自動擴大覆蓋")
        : `${state.siteName} 正射影像 · 導航高程以 DEM 優先，必要時採 MOLA`
      : `${state.optical && !state.layers.includes('terrain') ? "Viking 全球光學影像" : "MOLA 全球高程"} · 可建立區域任務`;
  }
  async function overviewHeights() {
    if (!planet) state.elevation = '正在載入全球數值高程…';
    try {
      const grid = await loadPlanet();
      if (disposed || !state.globalView) return;
      const center = map.getCenter();
      state.elevation = `視野中心高程 ${grid.sample(center.lat, center.lng).toFixed(1)} m · MOLA 16 ppd`;
    } catch (error) {
      if (!disposed && state.globalView) state.elevation = `全球高程載入失敗：${error.message}；再次點擊全覽可重試`;
    }
  }
  function overview() {
    state.pickingNoGo=false;
    regionalOverview = true;
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
    overviewHeights();
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
    state.pickingNoGo=false;
    regionalOverview = false;
    rebuildNavigation();
    navigationOverlay?.redraw();
    state.hasStart = false;
    state.pickingStart = false;
    state.expedition = [];
    state.pickingTarget = false;
    state.targetName = "";
    state.poi = null;
    stop();
    cancel();
    resetDrawing();
    clearRoute();
    remove(analysis);
    state.layer = "none";
    state.layers = [];
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
    if (state.regional || state.siteId !== "jezero") {
      remove(stationLayer);
      remove(expeditionLayer);
    } else {
      stationLayer?.addTo(map);
      expeditionLayer?.addTo(map);
    }
    state.warning = state.regional
      ? "全球真實 MOLA 高程 · 區域規劃 · 非障礙物尺度導航"
      : `真實 ${state.siteName} DEM · ${dem.value.width}×${dem.value.height} · 觀測為模擬`;
    state.source = state.regional
      ? `NASA PDS MOLA 16 ppd，來源含插值；球面方位等距投影。SHA-256 ${dem.value.source.original_sha256}`
      : state.siteId === "gale" ? "USGS Gale 合併 DEM：原生格距 1 m，本站取樣 20 m；混合來源不代表全域 1 m 精度。HiRISE 彩色正射影像展示 6.67 m；尚無 Gale 地質分類。未獨立評估配準精度。" : state.siteId === "valles-ctx" ? `USGS Valles CTX DTM：單組立體影像原生約 20 m，本站 20×20 km 取樣 40 m；有效格點 ${(100*dem.value.source.valid_fraction).toFixed(1)}%，缺值不外推。來源窗 SHA-256 ${dem.value.source.sampled_window_sha256}。` : `USGS CTX DEM 原生 20 m，30×30 km 取樣 40 m；正射影像顯示完整原檔範圍、約 20 m／像素。地質 Sun & Stack 2020，1:75,000。取樣窗 SHA-256 ${dem.value.source.sampled_window_sha256}；未獨立估計配準誤差。`;
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
      state.siteId = "mola";
      state.siteName = "MOLA";
      state.geologyAvailable = false;
      missionStart = { x: 0, y: 0 };
      profileOptions = regionalProfile(grid);
      state.estimate = { x: 650, y: -520, heading: 69 };
      state.targets = [];
      refreshMission();
      state.regionStatus = `已建立 512×512 km 區域任務 · 中心高程 ${p.sample(lat, lng).toFixed(0)} m。定位候選未校準，不自動校正；極區顯示會變形。`;
      state.routeStatus = "請先選擇起點，並新增目的地，再規劃路線。";
      return true;
    } catch (e) {
      if (!disposed && token === regionToken)
        state.regionStatus =
          "區域載入失敗：" + e.message + "；可再次點擊建立任務重試。";
    } finally {
      if (token === regionToken) state.regionLoading = false;
    }
  }
  async function startValles() {
    if (!state.ready || !slopeValid()) return;
    const token=++regionToken;
    stop(); cancel();
    state.regionLoading=true;
    state.regionStatus="載入 Valles CTX DEM 與正射影像…";
    try {
      const [grid]=await Promise.all([
        json("data/valles/dem.json",{signal:abort.signal}),
        json("data/valles/optical-source.json",{signal:abort.signal}),
        new Promise((resolve,reject)=>{
          const image=new Image();
          image.onload=resolve;
          image.onerror=()=>reject(Error("Valles 正射影像檔無法載入"));
          image.src=asset("data/valles/optical.png");
        }),
      ]);
      if(disposed || token!==regionToken) return;
      C.setDEM(grid);
      dem.value=grid;
      state.regional=false;
      state.siteId="valles-ctx"; state.siteName="Valles"; state.geologyAvailable=false;
      state.showNavigationRisk=false;
      geology=null; missionStart={x:0,y:0}; state.targets=[];
      state.lat=grid.origin.lat; state.lng=grid.origin.lng;
      profileOptions={angleStep:3,rayStep:80,maxRange:9000,cameraHeight:1.7,curvature:true};
      optical.setUrl(asset("data/valles/optical.png"));
      optical.setBounds([ll({x:C.LIMIT.minX,y:C.LIMIT.minY}),ll({x:C.LIMIT.maxX,y:C.LIMIT.maxY})]);
      refreshMission();
      state.regionStatus="Valles 20×20 km · CTX 正射影像已載入；DEM 40 m 取樣，空白處為缺值。可在圖層中開啟避險標示。";
    } catch(e) {
      if(!disposed && token===regionToken) state.regionStatus="Valles 載入失敗："+e.message+"；可重試。";
    } finally { if(token===regionToken) state.regionLoading=false; }
  }
  async function startGale() {
    if (!state.ready || !slopeValid()) return;
    const token=++regionToken;
    stop(); cancel();
    state.regionLoading=true;
    state.regionStatus="載入 Gale 高解析 DEM 與正射影像來源…";
    try {
      const [grid] = await Promise.all([json("data/gale/dem.json",{signal:abort.signal}),json("data/gale/optical-source.json",{signal:abort.signal})]);
      if(disposed || token!==regionToken) return;
      C.setDEM(grid);
      dem.value=grid;
      state.regional=false;
      state.siteId="gale"; state.siteName="Gale"; state.geologyAvailable=false;
      geology=null; missionStart={x:0,y:0}; state.targets=[];
      state.lat=grid.origin.lat; state.lng=grid.origin.lng;
      profileOptions={angleStep:3,rayStep:40,maxRange:6000,cameraHeight:1.7,curvature:true};
      optical.setUrl(asset("data/gale/optical.png"));
      optical.setBounds([ll({x:C.LIMIT.minX,y:C.LIMIT.minY}),ll({x:C.LIMIT.maxX,y:C.LIMIT.maxY})]);
      refreshMission();
      state.regionStatus="Gale 10×10 km · DEM 20 m 取樣 · 正射影像約 6.67 m/pixel；請在「任務」選擇起點；非好奇號實際位置。";
    } catch(e) {
      if(!disposed && token===regionToken) state.regionStatus="Gale 載入失敗："+e.message+"；可重試。";
    } finally { if(token===regionToken) state.regionLoading=false; }
  }
  function restore() {
    regionToken++;
    state.regionLoading = false;
    if (!snapshot) return;
    state.regional = false;
    state.siteId = "jezero";
    state.siteName = "Jezero";
    state.geologyAvailable = true;
    dem.value = snapshot.dem;
    geology = snapshot.geology;
    missionStart = snapshot.mission.start;
    state.targets = [];
    profileOptions = undefined;
    C.setDEM(dem.value);
    optical.setUrl(asset("data/jezero-extended/optical.png"));
    const photo=snapshot.photo;
    optical.setBounds([ll({x:photo.bounds[0],y:photo.bounds[1]}),ll({x:photo.bounds[2],y:photo.bounds[3]})]);
    refreshMission();
    state.regionStatus = "";
  }
  function bearingDemo() {
    if (!state.hasStart) return;
    const a = C.associate(
        C.captureObservations(state.truth, state.truth.heading),
      ),
      r = C.refinePose(a.pairs, state.estimate);
    state.bearing = r.ok
      ? `模擬方位解算 E ${r.x.toFixed(0)} / N ${r.y.toFixed(0)}，yaw ${r.heading.toFixed(1)}°，RMS ${r.rmsDeg.toFixed(3)}°；未套用導航估計。`
      : "有效地標不足或未收斂。";
  }
  function clearExpedition() {
    remove(expeditionLayer);
    expeditionLayer = null;
    state.expedition = [];
    state.expeditionStatus = "";
    state.profileIndex = -1;
    leaveProfile();
  }
  function locateDrawing(fit = false) {
    if (!map || !state.hasStart) return;
    const points = state.points.length ? state.points : state.route?.path || [];
    if (fit && points.length > 1) map.fitBounds(L.latLngBounds(points.map(ll)), { padding: [40, 40], maxZoom: 16 });
    else map.setView(ll(state.estimate), Math.max(map.getZoom(), 14));
  }
  function planExpedition() {
    if (!state.hasStart || state.regional || state.siteId !== "jezero") return;
    stop();
    cancel();
    if (!slopeValid()) return;
    const start = { ...missionStart },
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
    leaveProfile();
    profileSeries = [];
    state.profileLegend = [];
    const leg = state.profileIndex === -1
        ? state.route && { ...state.route, name: "目前路線" }
        : !state.regional && state.expedition[state.profileIndex],
      cv = profileCanvas.value;
    if (!cv) return;
    if (!leg) {
      cv.getContext("2d").clearRect(0, 0, cv.width, cv.height);
      state.profileInfo = "請先建立一般路線、手繪路線或 Three Forks 往返路線，以顯示高程剖面。";
      return;
    }
    const ctx = cv.getContext("2d"),
      samples = [],
      length = leg.path.reduce((sum, p, i, path) =>
        sum + (i ? C.distance(path[i - 1], p) : 0), 0),
      sampleStep = Math.max(15, state.regional ? C.demInfo().cellMeters / 4 : 0, length / 4096);
    let d = 0,
      maxSlope = 0,
      missing = 0;
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (let i = 1; i < leg.path.length; i++) {
      const a = leg.path[i - 1],
        b = leg.path[i],
        len = C.distance(a, b),
        n = Math.max(1, Math.ceil(len / sampleStep));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) {
        const t = k / n,
          x = a.x + (b.x - a.x) * t,
          y = a.y + (b.y - a.y) * t,
          z = C.elevation(x, y),
          s = C.slopeDeg(x, y);
        if (Number.isFinite(s)) maxSlope = Math.max(maxSlope, s);
        if (!Number.isFinite(z)) missing++;
        samples.push({ distance: d + len * t, z, x, y });
      }
      d += len;
    }
    const finite = samples.map((p) => p.z).filter(Number.isFinite);
    if (!finite.length) {
      state.profileInfo = "不可達路段，沒有可用剖面。";
      return;
    }
    profileSeries = [{ name: leg.name, samples, length: d, color: "#83e5d2" }];
    if (state.compareProfiles) {
      const labels = {shortest:'最短路線',safer:'較低風險路線',energy:'最低耗電路線'};
      const alternatives = Object.entries(state.routeOptions || {}).filter(([key,route]) => key !== state.selectedRoute && route.reachable)
        .map(([key,route],i) => ({...route,name:labels[key],index:-2-i}));
      const others = [...alternatives, state.route && { ...state.route, name: "目前路線", index: -1 },
        ...(!state.regional ? state.expedition.map((v, index) => ({ ...v, index })) : [])];
      for (const other of others.filter(v => v && v.index !== state.profileIndex && v.path?.length > 1)) {
        const points = [];
        let distance = 0;
        for (let i = 1; i < other.path.length; i++) {
          const a = other.path[i - 1], b = other.path[i], len = C.distance(a, b);
          const count = Math.max(1, Math.ceil(len / Math.max(sampleStep, (other.length || len) / 4096)));
          for (let k = i === 1 ? 0 : 1; k <= count; k++) {
            const t = k / count, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
            points.push({ distance: distance + len * t, x, y, z: C.elevation(x, y) });
          }
          distance += len;
        }
        profileSeries.push({ name: other.name, samples: points, length: distance,
          color: ["#ffbb79", "#b9b1ef"][ (profileSeries.length - 1) % 2] });
      }
    }
    const heights = profileSeries.flatMap(v => v.samples.map(p => p.z)).filter(Number.isFinite);
    const lo = Math.min(...heights), hi = Math.max(...heights);
    const longest = Math.max(...profileSeries.map(v => v.length), 1);
    profileScale = { longest, lo, hi };
    ctx.fillStyle = "#aebfc8";
    ctx.font = "10px sans-serif";
    ctx.fillText(`${hi.toFixed(0)} m`, 12, 12);
    ctx.fillText(`${lo.toFixed(0)} m`, 12, cv.height - 4);
    ctx.fillText(fmt(longest), cv.width - 70, cv.height - 4);
    for (const series of profileSeries) {
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let open = false;
      for (const p of series.samples) {
        if (!Number.isFinite(p.z)) { open = false; continue; }
        const x = 12 + p.distance / longest * (cv.width - 24),
          y = 20 + (hi - p.z) / Math.max(hi - lo, 1) * (cv.height - 40);
        if (open) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        open = true;
      }
      ctx.stroke();
    }
    state.profileLegend = profileSeries.map(v => ({ name: v.name, color: v.color, length: fmt(v.length) }));
    state.profileInfo = `${leg.name} · ${state.regional ? "MOLA" : state.siteName} DEM · ${fmt(d)} · 最大格網坡度 ${maxSlope.toFixed(1)}° · 缺值 ${missing}；每 ≤${Math.ceil(sampleStep)} m 取樣數值 DEM，非影像高程。`;
  }
  function leaveProfile() {
    remove(profileMarker);
    profileMarker = null;
    state.profileHover = "";
  }
  function hoverProfile(event) {
    const cv = profileCanvas.value;
    if (!cv || !profileSeries.length) return;
    drawProfile();
    const rect = cv.getBoundingClientRect(), px = (event.clientX - rect.left) / rect.width * cv.width;
    const distance = Math.max(0, Math.min(1, (px - 12) / (cv.width - 24))) * profileScale.longest;
    const hits = profileSeries.filter(v => distance <= v.length).map(v => ({ ...v,
      point: v.samples.reduce((a, b) => Math.abs(a.distance - distance) < Math.abs(b.distance - distance) ? a : b) }));
    state.profileHover = hits.map(v => `${v.name} · ${fmt(v.point.distance)} · 高程 ${Number.isFinite(v.point.z) ? v.point.z.toFixed(1) + " m" : "缺測"}`).join("；");
    if (hits.length && map) {
      profileMarker = L.layerGroup(hits.map(v => L.circleMarker(ll(v.point), { radius: 7, color: v.color, fillOpacity: 1 })
        .bindTooltip(`${esc(v.name)} · ${Number.isFinite(v.point.z) ? v.point.z.toFixed(1) + " m" : "缺測"}`))).addTo(map);
    }
    const ctx = cv.getContext("2d");
    ctx.strokeStyle = "#ffffff";
    ctx.beginPath(); ctx.moveTo(px, 18); ctx.lineTo(px, cv.height - 20); ctx.stroke();
  }
  function showStation(f) {
    if (state.regional || state.siteId !== "jezero" || !f) return;
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
        color: "#f2ed48",
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
    map.createPane('navigationRisk');
    map.getPane('navigationRisk').style.zIndex = 425;
    map.getPane('navigationRisk').style.pointerEvents = 'none';
    map.createPane('navigationRoute');
    map.getPane('navigationRoute').style.zIndex = 450;
    map.getPane('navigationRoute').style.pointerEvents = 'none';
    navigationOverlay = createNavigationOverlay(map);
    noGoLayer = L.layerGroup().addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl
      .setPrefix(false)
      .addAttribution(
        "NASA/JPL-Caltech/MSSS · USGS Sun & Stack 2020 · MGS/MOLA",
      );
    candidateLayer = L.layerGroup().addTo(map);
    horizonHoverLayer = L.layerGroup().addTo(map);
    poiLayer = L.layerGroup().addTo(map);
    namesLayer = L.layerGroup().addTo(map);
    estimateMarker = L.circleMarker([18.44, 77.42], {
      radius: 8,
      color: "#9af0e0",
      fillOpacity: 1,
    }).bindTooltip("導航估計位置");
    truthMarker = L.circleMarker([18.44, 77.42], {
      radius: 6,
      color: "#ffad72",
    }).bindTooltip("模擬真值（評估用）");
    trail = L.polyline([], { color: "#eeb584", weight: 2 }).addTo(map);
    map.on("mousemove", (e) => {
      const p = local(e),
        localZ = state.globalView ? NaN : C.demAt(p.x, p.y),
        z = Number.isFinite(localZ)
          ? localZ
          : planet?.sample(e.latlng.lat, e.latlng.lng),
        height = Number.isFinite(z) ? `高度 ${z.toFixed(1)} m` : "高度：無資料";
      state.coords = `${e.latlng.lat.toFixed(5)}°N ${e.latlng.lng.toFixed(5)}°E · ${height} · ${unitLabel(unitAt(p))}`;
      const scienceValue = sampleScienceGrid(state.scienceMeta, state.scienceLayers[state.layer]?.values, e.latlng.lat, e.latlng.lng);
      if (scienceValue !== null) state.coords += ` · ${scienceValue.toFixed(3)} ${state.scienceMeta.unit}`;
      else if (state.scienceMeta?.kind === 'raster') state.coords += ' · 科學格網：無資料';
      const nav=C.navigationAt(p.x,p.y);
      if(nav.reasons.length) state.coords += ` · ${nav.reasons.join("；")}`;
      state.elevation = Number.isFinite(z)
        ? `游標高程 ${z.toFixed(1)} m · ${Number.isFinite(localZ) && !state.regional ? state.siteName + " DEM" : "MOLA 16 ppd · 無法判定局部粗糙度"}`
        : "游標高程：無資料";
    });
    map.on("click", async (e) => {
      if(state.pickingNoGo) {
        const radius=Number(state.noGoRadius);
        if(!Number.isFinite(radius)||radius<10||radius>100000||Math.abs(e.latlng.lat)>90){state.routeStatus='禁行區半徑須介於 10–100,000 m';return;}
        state.noGoZones.push({id:createUiId(),name:state.noGoName.trim()||`人工禁行區 ${state.noGoZones.length+1}`,lat:e.latlng.lat,lng:((e.latlng.lng+180)%360+360)%360-180,radius});
        state.pickingNoGo=false; state.noGoName='';
        return;
      }
      if (state.pickingStart) {
        if (state.regionLoading) return;
        if (!inDem(e.latlng) || C.risk(local(e).x, local(e).y).unknown) {
          const geo = {lat:e.latlng.lat,lng:((e.latlng.lng+180)%360+360)%360-180};
          if (!(await coverTarget(geo))) return;
        }
        const p = local(e);
        if (!C.validDEMPoint(p.x, p.y) || C.risk(p.x, p.y).blocked) {
          state.routeStatus = "請選有高程資料且符合坡度與粗糙度門檻的起點。";
          return;
        }
        missionStart = { ...p };
        state.hasStart = true;
        reset(state.scenario, {preserveTargets:true});
        state.pickingStart = false;
        state.truth = { ...p, heading: 45 };
        state.estimate = { ...p, heading: 45 };
        state.message = "導航位置已設為所選起點；行進後可用地平線檢查與校正偏差。";
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
    function updateGuidanceView() {
      const b=map.getBounds(), center=map.getCenter();
      state.guidanceView = {center:{lat:center.lat,lng:center.lng},north:b.getNorth(),south:b.getSouth(),east:b.getEast(),west:b.getWest()};
    }
    map.on("moveend resize", updateGuidanceView);
    updateGuidanceView();
    map.on("moveend zoomend", scope);
    map.on("zoomend", filterNames);
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
      const [grid, geo, mission, photo, names, stations] =
        await Promise.all(
          [
            "jezero-extended/dem.json",
            "geology.json",
            "mission.json",
            "jezero-extended/optical-source.json",
            "mars-names.json",
            "three-forks.geojson",
          ].map((p) => json("data/" + p, { signal: abort.signal })),
        );
      if (disposed) return;
      snapshot = { dem: grid, geology: geo, mission, photo };
      dem.value = grid;
      geology = geo;
      geologyIndex = createGeologyIndex(geo);
      missionStart = mission.start;
      state.targets = [];
      C.setDEM(grid);
      if (!optical) {
        optical = L.imageOverlay(
          asset("data/jezero-extended/optical.png"),
          [
            ll({ x: photo.bounds[0], y: photo.bounds[1] }),
            ll({ x: photo.bounds[2], y: photo.bounds[3] }),
          ],
          { opacity: 1, className: 'local-dem-image' },
        ).addTo(map);
        optical.on("error", () => {
          state.warning = "正射影像裁切載入失敗；地圖不可視為影像底圖。";
        });
        globalBase = L.layerGroup().addTo(map);
        for (const offset of [-360, 0, 360])
          L.imageOverlay(
            asset("data/mars-global-optical.jpg"),
            [
              [-90, -180 + offset],
              [90, 180 + offset],
            ],
            { pane: 'tilePane', zIndex: -1, interactive: false },
          )
            .addTo(globalBase)
            .on("error", () => {
              state.namesError = "全球底圖載入失敗，請重新載入。";
            });
      }
      state.entries = [...names.entries, {
        name: 'Octavia E. Butler Landing', lat: 18.4446, lng: 77.4509,
        eastLongitude: 77.4509, type: '歷史著陸點', code: 'LANDING', diameterKm: 0,
        featured: true, kind: 'NASA 命名歷史著陸點（非 IAU 正式地名）',
        description: '毅力號火星車的歷史著陸位置，非即時車輛位置。',
        origin: 'NASA 任務團隊以作家 Octavia E. Butler 命名。',
        url: 'https://science.nasa.gov/resource/welcome-to-octavia-e-butler-landing/',
      }];
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
  watch(() => state.layer, kind => {
    if (kind !== 'none' && !state.layers.includes(kind)) state.layers = [kind];
    else if (kind === 'none' && state.layers.length) state.layers = [];
    if (map) scope();
  });
  watch(() => state.layers, () => { setLayer(); if (map) scope(); });
  let styleTimer;
  watch(() => state.layerStyles, () => {
    clearTimeout(styleTimer);
    styleTimer = setTimeout(() => { if (map && !disposed) setLayer(); }, 180);
  }, { deep: true });
  watch(
    () => state.optical,
    (v) => {
      if (!map || !optical) return;
      if (v && !state.regional) optical.addTo(map);
      else remove(optical);
      setLayer();
      scope();
    },
  );
  watch(() => state.showNavigationRisk, () => {syncNavigationRisk();redrawNoGoZones();});
  watch(
    () => state.truthVisible,
    () => map && scope(),
  );
  watch(
    () => [state.slope, state.roughnessLimit],
    () => {
      stop();
      cancel();
      clearRoute();
      syncNavigationRisk(true);
      state.routeStatus = "避險門檻已變更；請重新規劃。";
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
      state.message = state.hasStart ? "保留導航估計；請重新掃描。" : "請先在「任務」選擇起點。";
      if (!state.hasStart) state.status = "尚未設定起點";
      observation = null;
    state.externalHorizon = false;
      observationPose = null;
      displayedCandidate = null;
      candidateLayer?.clearLayers();
      drawCurve();
      render();
    },
  );
  watch(() => [JSON.stringify(state.navigation),JSON.stringify(state.noGoZones)], () => {
    stop();cancel();clearRoute();
    rebuildNavigation();
    if(state.navigation.thermalEnabled && !navigationThermal) loadNavigationThermal();
    else {navigationLoadToken++;state.navigationLoading=false;}
    state.routeStatus='導航資料或人工禁行區已變更，請重新規劃。';
  });
  watch(() => state.continuousLocalization, (enabled) => {
    cancel();
    if (enabled && state.running) scan(true);
  });
  watch(() => [state.profileIndex, state.regional, state.compareProfiles, state.expedition], drawProfile);
  watch(() => state.route, drawProfile);
  watch(() => [JSON.stringify(state.planner), state.stopIds.join('|')], () => {
    stop(); clearRoute();
    state.routeStatus = '規劃假設或停靠順序已變更，請重新建立路線。';
  });
  watch(() => state.targets.map(t => t.id).join('|'), () => {
    state.stopIds = state.stopIds.filter(id => state.targets.some(t => t.id === id));
  });
  watch(() => state.walk && [state.walk.includeB, ...state.walk.stations.map(s=>s.stopMinutes), state.walk.stations.find(s=>s.id===state.walk.at)?.outcome, JSON.stringify(state.planner)].join('|'), async (value, previous) => {
    if (!value || !previous || !state.walk) return;
    const w = state.walk;
    if (w.at === 'base') {
      state.stopIds = w.includeB ? [w.stations[0].id] : [];
      state.destination = w.stations[w.includeB ? 1 : 0].id;
      await nextTick();
    }
    if (state.walk === w) plan();
  });
  watch(() => state.destination, () => {
    stop(); clearRoute();
    state.routeStatus = '目的地已變更，請建立路線。';
  });
  watch(profileCanvas, drawProfile);
  watch(panorama, render);
  watch(() => [state.viewYaw, state.destination, state.poi, state.pois, state.targets], () => {
    render();
    drawCurve(displayedCandidate);
  });
  watch(curve, () => drawCurve(state.result?.candidates[0]));
  onScopeDispose(() => {
    clearTimeout(styleTimer);
    disposed = true;
    abort.abort();
    regionToken++;
    stop();
    cancel();
    cleanupPointer?.();
    C.setNavigationContext(null);
    map?.remove();
  });
  return {
    state,
    dem,
    openLocalization, closeLocalization, startWalk, advanceWalk, focusWalkStation, planWalkFromStation,
    geologyAt: point => unitLabel(unitAt(point)),
    scienceAt: (point) => {
      if (!state.ready || state.regionLoading || !dem.value || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      const geo = C.localToLatLng(point.x, point.y);
      const height = C.demAt(point.x, point.y);
      const unit = unitAt(point);
      return { ...geo, height, slope: Number.isFinite(height) ? C.slopeDeg(point.x, point.y) : NaN,
        unit: unit ? unitLabel(unit) : null, cellMeters: C.demInfo()?.cellMeters,
        source: dem.value.source?.url };
    },
    scienceCellAt: point => scienceCell(state.scienceMeta, state.scienceLayers[state.layer]?.values, point?.lat, point?.lng),
    scienceValueAt: (point) => sampleScienceGrid(state.scienceMeta, state.scienceLayers[state.layer]?.values, point?.lat, point?.lng),
    retryScience: () => setLayer(),
    focusScience: () => {
      const meta = state.scienceMeta;
      if (!meta || !map) return;
      if (meta.kind === 'station') map.setView([meta.lat, meta.lng], 9, { animate: false });
      else map.setView([0,0], 2, { animate: false });
    },
    position,
    errorDistance,
    matches,
    displayed,
    panorama,
    hoverHorizon,
    leaveHorizon,
    curve,
    profileCanvas,
    hoverProfile,
    leaveProfile: () => drawProfile(),
    locateDrawing,
    asset,
    fmt,
    typeLabels,
    mount,
    boot,
    reset,
    stop,
    cancel,
    plan,
    beginNoGo, removeNoGo, retryNavigation: loadNavigationThermal,
    toggleMotion,
    drift,
    scan,
    matchHorizon: (obs) => scan(false, obs),
    horizonOptions: () => ({ ...profileOptions }),
    drawCurve,
    turnView: (degrees) => { state.viewYaw = ((state.viewYaw + degrees + 540) % 360) - 180; },
    focusView: () => {
      const target = state.poi || state.targets.find((p) => p.id === state.destination);
      if (!target) return;
      const pose = observationPose || state.truth;
      state.viewYaw = C.modDeg(Math.atan2(target.x - pose.x, target.y - pose.y) / C.DEG - pose.heading);
    },
    beginDrawing,
    selectRoute,
    addStop,
    addNamedTarget,
    moveStop,
    removeStop: index => state.stopIds.splice(index, 1),
    fitRoute: () => { if (state.route?.path.length) map.fitBounds(L.latLngBounds(state.route.path.map(ll)), { padding: [30,30] }); },
    exportPlan: () => {
      const route = state.routeOptions?.[state.selectedRoute];
      if (!route?.reachable) return;
      const { path, ...metrics } = route;
      const payload = { type: 'FeatureCollection', properties: { decisionNote: state.walk?.decisionNote, stationRecords: state.walk?.stations, elapsedHours: state.walk?.elapsed, body: 'Mars', coordinates: 'Planetocentric east-positive longitude/latitude; not Earth WGS84', assumptions: {...state.planner}, slopeLimit: Number(state.slope), roughnessLimit: Number(state.roughnessLimit), navigation: {...state.navigation}, noGoZones: state.noGoZones.map(z=>({...z})), navigationModel: "User-defined material hypotheses; max geology/thermal factor; no calibrated vehicle model", navigationSources: {geology: state.navigation.geologyEnabled ? {source:snapshot?.geology?.source,sha256:snapshot?.geology?.raw_sha256} : null,thermal: state.navigation.thermalEnabled && navigationThermal ? {source:navigationThermal.meta.source.url,sha256:navigationThermal.meta.source.sha256,unit:navigationThermal.meta.unit,pixelsPerDegree:navigationThermal.meta.display_ppd} : null}, dem: C.demInfo(), warning: 'Prototype terrain planning; not operational navigation' }, features: [{ type: 'Feature', properties: { mode: state.selectedRoute, ...metrics }, geometry: { type: 'LineString', coordinates: path.map(p => { const ll = C.localToLatLng(p.x,p.y); return [ll.lng,ll.lat,C.elevation(p.x,p.y)]; }) } }] };
      if (state.walk) {
        if (state.walk.at === 'home') payload.features = [];
        for (const {path:coordinates,...leg} of state.walk.completedLegs) {
          payload.features.push({type:'Feature',properties:{...leg,status:'已行進'},geometry:{type:'LineString',coordinates}});
        }
        for (const station of state.walk.stations) {
          const {lat,lng} = C.localToLatLng(station.x,station.y);
          payload.features.push({type:'Feature',properties:{...station},geometry:{type:'Point',coordinates:[lng,lat]}});
        }
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)], {type:'application/geo+json'}));
      const link = document.createElement('a'); link.href=url; link.download='mars-mission.geojson'; link.click();
      setTimeout(() => URL.revokeObjectURL(url),1000);
    },
    beginStart: () => {
      state.pickingNoGo=false;
      if (state.regionLoading) return;
      stop(); cancel(); resetDrawing();
      state.pickingTarget = false;
      state.pickingStart = !state.pickingStart;
      state.routeStatus = state.pickingStart ? "請在地圖選起點；局部 DEM 有效處優先，近區域越界處合併使用 MOLA。" : "已取消選起點。";
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
    startGale,
    startValles,
    restore,
    bearingDemo,
    planExpedition,
    showStation,
    resize: () => map?.invalidateSize(),
    // Explicit test-only access; never installed on window in production.
    inspect: () => ({ dem: dem.value, observation, waypoint, profileOptions, analysis }),
    appendPoint: append,
  };
}
