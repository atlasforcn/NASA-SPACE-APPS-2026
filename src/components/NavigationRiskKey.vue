<template>
  <span><i class="risk-swatch"></i>Red: exclusion zone or terrain limit exceeded</span>
  <span><i class="risk-swatch missing"></i>Yellow: missing data</span>
</template>

<style scoped>
.risk-swatch { width: 10px; height: 10px; flex-shrink: 0; border-radius: 2px; background: #ff736e; }
.risk-swatch.missing { background: #eab45a; }
</style>
