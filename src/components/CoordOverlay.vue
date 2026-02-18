<template>
  <div class="coord-overlay">
    <div class="row">
      <span class="label">中心</span>
      <span class="value">X {{ centerX }}</span>
      <span class="value">Z {{ centerZ }}</span>
    </div>
    <div class="row">
      <span class="label">下界</span>
      <span class="value">X {{ netherX }}</span>
      <span class="value">Z {{ netherZ }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { camera } from '@/stores/mapStore'

const centerX = computed(() => Math.round(camera.x))
const centerZ = computed(() => Math.round(camera.z))
const netherX = computed(() => Math.floor(centerX.value / 8))
const netherZ = computed(() => Math.floor(centerZ.value / 8))
</script>

<style scoped>
.coord-overlay {
  position: fixed;
  left: 14px;
  bottom: 12px;
  z-index: 92;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--ui-border);
  background: color-mix(in oklab, var(--morandi-cream) 76%, #000000 24%);
  box-shadow: var(--ui-shadow);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  min-width: 120px;
}

.row {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 12px;
}

.row + .row {
  margin-top: 6px;
}

.label {
  color: var(--ui-muted);
  width: 28px;
}

.value {
  color: #f5c0ab;
}

@media (max-width: 768px) {
  .coord-overlay {
    left: 10px;
    bottom: 10px;
    min-width: 170px;
    padding: 8px 10px;
  }
}
</style>
