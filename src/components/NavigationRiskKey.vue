<template>
  <span><i class="risk-swatch"></i>紅色：人工禁行或地形超限</span>
  <span><i class="risk-swatch missing"></i>黃色：資料缺失</span>
</template>

<style scoped>
.risk-swatch { width: 10px; height: 10px; flex-shrink: 0; border-radius: 2px; background: #ff736e; }
.risk-swatch.missing { background: #eab45a; }
</style>
