<script setup>
import { inject } from "vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section class="localization" aria-label="地平線定位">
    <div class="localization-controls">
      <p class="eyebrow">03 / HORIZON LOCALIZATION</p>
      <div class="section-title">
        <h2>用地平線找回位置</h2>
        <span id="localization-status" class="status-pill" role="status">{{
          s.status
        }}</span>
      </div>
      <label
        >模擬觀測品質<select id="observe-mode" v-model="s.scenario">
          <option value="good">360° 完整觀測</option>
          <option value="poor">60° 視角＋55% 遮擋</option>
        </select></label
      >
      <label class="checkbox">
        <input id="continuous-localization" v-model="s.continuousLocalization" type="checkbox" />
        行進中自動以地平線校正
      </label>
      <p class="hint">
        規劃路線並開始行進後，每 {{ s.regional ? "4 km" : "250 m" }} 更新觀測；
        搜尋期間持續移動，可靠定位才套用校正。已校正 {{ s.localizationCount }} 次。
      </p>
      <div class="button-row">
        <button
          id="scan"
          class="primary"
          :disabled="!s.ready || s.searching || s.regionLoading"
          @click="m.scan"
        >
          ◎ 掃描並重新定位</button
        ><button id="cancel" :disabled="!s.searching" @click="m.cancel">
          取消
        </button>
      </div>
      <button id="drift" :disabled="!s.ready" @click="m.drift">
        注入里程偏差 +650 / −520 m
      </button>
      <p class="hint" id="search-progress" role="status">{{ s.progress }}</p>
      <p class="position" id="position">{{ m.position.value }}</p>
      <p class="hint">
        E {{ s.estimate.x.toFixed(0) }} m · N {{ s.estimate.y.toFixed(0) }} m ·
        yaw {{ s.estimate.heading.toFixed(1) }}°
      </p>
      <label class="checkbox"
        ><input
          id="evaluation"
          v-model="s.truthVisible"
          type="checkbox"
        />顯示模擬真值（評估用）</label
      >
      <div v-if="s.truthVisible" id="truth-panel">
        <p class="hint">
          位置誤差 {{ m.errorDistance.value }} · 累積行進
          {{ m.fmt(s.travelled) }}
        </p>
        <p class="hint">{{ s.evaluation }}</p>
      </div>
    </div>
    <div class="horizon-charts">
      <div class="chart-head">
        <span>DEM 模擬視角</span><span>非真實照片 / 120°</span>
      </div>
      <div class="button-row">
        <button :disabled="!s.ready" @click="m.turnView(-30)">← 左轉 30°</button>
        <button :disabled="!s.ready" @click="m.turnView(30)">右轉 30° →</button>
        <button :disabled="!s.ready || (!s.poi && !s.destination)" @click="m.focusView">對準標記點</button>
      </div>
      <p class="hint">標記顯示名稱與距離；虛線表示地形遮擋或視野外。可點選地圖標記後對準。</p>
      <canvas
        id="panorama"
        :ref="(el) => (m.panorama.value = el)"
        width="700"
        height="260"
        role="img"
        aria-label="DEM 模擬地平線視角，含標記點名稱、距離及遮擋提示"
      ></canvas
      ><canvas
        id="curve"
        :ref="(el) => (m.curve.value = el)"
        width="700"
        height="160"
        role="img"
        aria-label="觀測與候選地平線曲線"
      ></canvas>
    </div>
    <div class="localization-results">
      <p id="match-msg" class="hint" role="status">{{ s.message }}</p>
      <ol id="candidates" aria-label="Top 3 定位候選">
        <li v-for="(v, i) in s.result?.candidates || []" :key="i">
          <button @click="m.drawCurve(v)">
            <strong>#{{ i + 1 }} · RMS {{ v.score.toFixed(3) }}°</strong
            ><small
              >E {{ v.x.toFixed(0) }} / N {{ v.y.toFixed(0) }} · yaw
              {{ v.heading.toFixed(1) }}° · 有效
              {{ (v.coverage * 100).toFixed(0) }}%</small
            >
          </button>
        </li>
      </ol>
      <details>
        <summary>已知地標方位定位：原理解說</summary>
        <p class="hint">
          模擬 descriptor 配對已知峰頂，以方位角最小平方法解算；僅展示數學結果。
        </p>
        <button id="bearing-demo" :disabled="!s.ready" @click="m.bearingDemo">
          執行模擬地標解算
        </button>
        <p class="hint">{{ s.bearing }}</p>
      </details>
      <p class="notice">
        教育概念驗證 · 圖層為真實資料；觀測、車輛與漂移為模擬。
      </p>
    </div>
  </section>
</template>
