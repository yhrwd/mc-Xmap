<template>
  <div class="app">
    <TopBar />
    <ControlPanel />
    <div class="map-container">
      <MapCanvas />
      <div class="crosshair" aria-hidden="true"></div>
    </div>
    <CoordOverlay />
    <FloatingControls />
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import TopBar from '@/components/TopBar.vue'
import ControlPanel from '@/components/ControlPanel.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import FloatingControls from '@/components/FloatingControls.vue'
import CoordOverlay from '@/components/CoordOverlay.vue'
import { loadMarkers, loadTileIndex } from '@/stores/mapStore'

onMounted(async () => {
  await loadTileIndex()
  await loadMarkers()
})
</script>

<style scoped>
.app {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.map-container {
  position: fixed;
  top: 52px;
  left: 0;
  right: 0;
  bottom: 0;
  background: #1f1a18;
}

/* 核心修改：标准十字准星样式 */
.crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 24px;  /* 准星整体尺寸，可按需调整 */
  height: 24px;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 20;
  opacity: 1;
}

.crosshair::before,
.crosshair::after {
  content: '';
  position: absolute;
  background: rgba(255, 255, 255, 0.92);
  /* 添加细边框增强对比度，可选 */
  border: 0.5px solid rgba(0, 0, 0, 0.5);
}

/* 垂直竖线 */
.crosshair::before {
  width: 1px;    /* 线条宽度 */
  height: 100%;  /* 高度铺满准星容器 */
  left: 50%;     /* 水平居中 */
  top: 0;
  transform: translateX(-50%); /* 精准居中 */
}

/* 水平横线 */
.crosshair::after {
  width: 100%;   /* 宽度铺满准星容器 */
  height: 1px;   /* 线条高度 */
  left: 0;
  top: 50%;      /* 垂直居中 */
  transform: translateY(-50%); /* 精准居中 */
}

@media (max-width: 768px) {
  .map-container {
    top: 52px;
  }
}
</style>