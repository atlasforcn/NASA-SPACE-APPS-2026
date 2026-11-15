<script setup>
import { inject } from "vue";
import HorizonInput from "./HorizonInput.vue";
import { missionKey } from "../useMission";
const m = inject(missionKey),
  s = m.state;
</script>
<template>
  <section id="localization-tool" class="localization" aria-label="地平線定位" @keydown.esc="m.closeLocalization">
    <div class="localization-toolbar"><h2>山頂相儀 · 地平線定位</h2><button id="close-localization" @click="m.closeLocalization">關閉並返回規劃</button></div>
    <div class="localization-controls">

      <div class="section-title">
        <h3>掃描與候選位置</h3>
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
        {{ s.regional ? "行進中更新地平線實驗候選" : "行進中自動以地平線校正" }}
      </label>
      <p class="hint">
        規劃路線並開始行進後，每 {{ s.regional ? "4 km" : "250 m" }} 更新觀測；
        {{ s.regional ? "搜尋期間持續移動；MOLA 尚未校準可信度，候選不套用位置校正。" : `搜尋期間持續移動，可靠定位才套用校正。已校正 ${s.localizationCount} 次。` }}
      </p>
      <div class="button-row">
        <button
          id="scan"
          class="primary"
          :disabled="!s.ready || !s.hasStart || s.searching || s.regionLoading"
          @click="m.scan"
        >
          ◎ 掃描並重新定位</button
        ><button id="cancel" :disabled="!s.searching" @click="m.cancel">
          取消
        </button>
      </div>
      <button id="drift" :disabled="!s.ready || !s.hasStart" @click="m.drift">
        注入里程偏差 +650 / −520 m
      </button>
      <p class="hint" id="search-progress" role="status">{{ s.progress }}</p>
      <p class="position" id="position">{{ m.position.value }}</p>
      <p v-if="s.hasStart" class="hint">
        E {{ s.estimate.x.toFixed(0) }} m · N {{ s.estimate.y.toFixed(0) }} m ·
        yaw {{ s.estimate.heading.toFixed(1) }}°
      </p>
      <label class="checkbox"
        ><input
          id="evaluation"
          :disabled="!s.hasStart"
          v-model="s.truthVisible"
          type="checkbox"
        />顯示模擬真值（評估用）</label
      >
      <div v-if="s.hasStart && s.truthVisible" id="truth-panel">
        <p class="hint">
          位置誤差 {{ m.errorDistance.value }} · 累積行進
          {{ m.fmt(s.travelled) }}
        </p>
        <p class="hint">{{ s.evaluation }}</p>
      </div>
    </div>
    <div class="horizon-charts">
      <HorizonInput />
      <div class="chart-head">
        <span>{{ s.externalHorizon ? "手繪／照片輪廓與 DEM 候選" : "DEM 模擬掃描視角" }}</span><span>輪廓視窗 / 120°</span>
      </div>
      <div class="button-row">
        <button :disabled="!s.ready || !s.hasStart" @click="m.turnView(-30)">← 左轉 30°</button>
        <button :disabled="!s.ready || !s.hasStart" @click="m.turnView(30)">右轉 30° →</button>
        <button :disabled="!s.ready || !s.hasStart || (!s.poi && !s.destination)" @click="m.focusView">對準標記點</button>
      </div>
      <p v-if="!s.externalHorizon" class="hint">標記為已知地圖位置的輔助投影，不參與地平線定位；虛線與空心點表示不可見或視野外，並非相機辨識結果。可點選地圖標記後對準。</p>
      <div class="chart-legend" aria-label="地平線圖例">
        <span><i class="legend-line orange"></i>橘線：{{ s.externalHorizon ? "手繪／照片輪廓" : "模擬觀測" }}</span>
        <span><i class="legend-line mint"></i>青線：候選地平線</span>
        <span>深色／缺口：無觀測資料</span>
      </div>
      <canvas
        id="panorama"
        @pointermove="m.hoverHorizon"
        @pointerleave="m.leaveHorizon"
        @pointercancel="m.leaveHorizon"
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
      <p class="hint" id="horizon-hover" role="status">{{ s.horizonHover || "掃描後，移動滑鼠至快照可在地圖查看對應輪廓點；標示的是該方向仰角最高的地形點。" }}</p>
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
        <button id="bearing-demo" :disabled="!s.ready || !s.hasStart" @click="m.bearingDemo">
          執行模擬地標解算
        </button>
        <p class="hint">{{ s.bearing }}</p>
      </details>
      <details>
        <summary>如何判讀掃描圖與定位結果</summary>
        <p v-if="!s.externalHorizon" class="hint">上下圖使用同一次掃描、同一個 120° 視窗，左右轉動會同步；深色區與曲線缺口表示無觀測。行進時保留掃描當下的視角，直到下一次掃描更新。畫面以仰角縮放，並非相機透視照片；定位仍比對完整掃描中的有效資料。60° 視角不足全周 50% 的校正門檻，顯示候選不代表定位成功。</p>
        <p class="notice">
          教育概念驗證 · DEM 為真實資料；手繪／照片為使用者輸入，其餘觀測、車輛與漂移為模擬。
        </p>
      </details>
    </div>
  </section>
</template>
