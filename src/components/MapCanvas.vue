<template>
  <canvas ref="canvasRef" class="map-canvas" :class="{ grabbing: isDragging }" />
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useMapRenderer } from '@/composables/useMapRenderer'
import { useMapInteraction } from '@/composables/useMapInteraction'
import { markers, camera, isDragging, tileIndex } from '@/stores/mapStore'

const canvasRef = ref<HTMLCanvasElement | null>(null)

// 使用渲染组合式函数
const { requestRender, loadMissingTiles, resizeCanvas } = useMapRenderer(canvasRef)

const syncViewport = () => {
  resizeCanvas()
  requestRender(markers.value)
  loadMissingTiles(markers.value)
}

// 使用交互组合式函数
useMapInteraction(canvasRef, {
  onRender: () => {
    requestRender(markers.value)
  },
})

// 监听相机变化，重新渲染
watch(
  () => [camera.x, camera.z, camera.zoom],
  () => {
    requestRender(markers.value)

    // 在相机变化时异步加载缺失的瓦片
    if (!isDragging.value) {
      loadMissingTiles(markers.value)
    }
  },
)

// 监听瓦片索引加载完成，确保首次可见瓦片会被请求加载
watch(
  () => tileIndex.value,
  (index) => {
    if (!index || index.tiles.length === 0) return
    requestRender(markers.value)
    loadMissingTiles(markers.value)
  },
  { deep: true },
)

// 监听拖拽状态，拖拽结束时加载缺失瓦片
watch(isDragging, (dragging) => {
  if (!dragging) {
    // 拖拽结束时加载缺失的瓦片
    setTimeout(() => {
      loadMissingTiles(markers.value)
    }, 100)
  }
})

// 监听标记变化
watch(
  () => markers.value,
  () => {
    requestRender(markers.value)
  },
  { deep: true },
)

onMounted(() => {
  document.addEventListener('fullscreenchange', syncViewport)
  window.addEventListener('orientationchange', syncViewport)

  // 初始渲染
  requestRender(markers.value)

  // 初始加载缺失瓦片
  setTimeout(() => {
    loadMissingTiles(markers.value)
  }, 100)

  // 等待初始布局稳定后再同步一次，避免首帧空白
  setTimeout(syncViewport, 0)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', syncViewport)
  window.removeEventListener('orientationchange', syncViewport)
})
</script>

<style scoped>
.map-canvas {
  width: 100%;
  height: 100%;
  cursor: grab;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}

.map-canvas.grabbing {
  cursor: grabbing;
}
</style>
