<script setup>
import {inject} from 'vue';
import {missionKey} from '../useMission';
const m=inject(missionKey),s=m.state;
</script>
<template>
  <div class="navigation-materials">
    <details id="settings-no-go" class="planning-assumptions">
      <summary>人工禁行區（{{ s.noGoZones.length }}）</summary>
      <label>區域名稱<input id="no-go-name" v-model="s.noGoName" maxlength="80" placeholder="例如：鬆砂、岩塊密集區" /></label>
      <label>禁行半徑（m）<input id="no-go-radius" v-model.number="s.noGoRadius" type="number" min="10" max="100000" /></label>
      <button id="pick-no-go" :disabled="!s.ready || s.regionLoading" :aria-pressed="s.pickingNoGo" @click="m.beginNoGo">{{ s.pickingNoGo ? '取消標記' : '在地圖點選禁行區中心' }}</button>
      <p v-if="s.pickingNoGo" role="status" class="hint">點選禁行區中心，紅色虛線圈內禁止通行。</p>
      <ul class="no-go-list"><li v-for="zone in s.noGoZones" :key="zone.id">{{ zone.name }} · 半徑 {{ m.fmt(zone.radius) }}<button :aria-label="`移除禁行區 ${zone.name}`" @click="m.removeNoGo(zone.id)">移除</button></li></ul>
      <p class="hint">人工禁行區會阻擋三種路線，包括起點或終點；跨區任務仍保留其地理位置。</p>
    </details>
    <details id="settings-material" class="planning-assumptions">
      <summary>地質與熱慣量耗電參數</summary>
      <p class="hint">材質成本與禁行區可獨立設定，切換地圖圖層只會改變顯示。</p>
      <label class="checkbox"><input id="nav-geology" v-model="s.navigation.geologyEnabled" type="checkbox" />依地質單元修正耗電</label>
      <div class="field-pair">
        <label>風成沙地倍率<input id="nav-sand-factor" v-model.number="s.navigation.sandFactor" type="number" min="1" max="5" step="0.1" /></label>
        <label>崎嶇／坑緣等倍率<input id="nav-rock-factor" v-model.number="s.navigation.rockFactor" type="number" min="1" max="5" step="0.05" /></label>
      </div>
      <p class="hint">依 Jezero 地質圖將風成單元映射為沙地；崎嶇、蝕刻上部、坑緣與噴出物等單元映射為較難通行材質。其餘已知單元倍率為 1。倍率可自行調整，用來估算不同地表的行進耗電。</p>
      <label class="checkbox"><input id="nav-thermal" v-model="s.navigation.thermalEnabled" type="checkbox" />加入低熱慣量材質假設</label>
      <div v-if="s.navigation.thermalEnabled" class="field-pair">
        <label>低熱慣量門檻<input id="nav-thermal-threshold" v-model.number="s.navigation.thermalThreshold" type="number" min="0" max="1000" /></label>
        <label>低熱慣量耗電倍率<input id="nav-thermal-factor" v-model.number="s.navigation.thermalFactor" type="number" min="1" max="5" step="0.1" /></label>
      </div>
      <p v-if="s.navigation.thermalEnabled" class="hint">門檻單位 J m⁻² K⁻¹ s⁻½；TES 為區域材質線索，非即時溫度或陷車機率。原格網約 7.4 km／格，不會產生格內的細部差異。</p>
      <label>材質資料不足的耗電倍率<input id="nav-unknown-factor" v-model.number="s.navigation.unknownFactor" type="number" min="1" max="5" step="0.05" /></label>
      <p class="hint">地質與熱慣量取較高倍率，不重複相乘。未知材質增加假設成本，不直接禁行；地形缺測仍禁行。最低耗電與較低風險方案會參考材質，最短方案保留距離目標。</p>
      <p v-if="!s.navigation.thermalEnabled && !s.navigationError" class="hint">{{ s.navigationStatus }}</p>
    </details>
  </div>
</template>
