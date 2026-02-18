<template>
  <div class="zoom-pill" title="当前缩放">{{ zoomPercent }}%</div>

  <div class="floating-controls">
    <button class="control-btn" @click="handleZoomIn" title="放大">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    </button>

    <button class="control-btn" @click="handleZoomOut" title="缩小">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
      </svg>
    </button>

    <button class="control-btn" @click="handleReset" title="重置视图">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
    </button>

    <button class="control-btn" @click="toggleFullscreen" title="全屏">
      <svg v-if="!isFullscreen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
      </svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { jumpToCoord, setZoom, camera, zoomPercent } from '@/stores/mapStore'

const isFullscreen = ref(false)

function handleZoomIn() {
  setZoom(camera.zoom * 1.2, window.innerWidth / 2, window.innerHeight / 2)
}

function handleZoomOut() {
  setZoom(camera.zoom * 0.8, window.innerWidth / 2, window.innerHeight / 2)
}

function handleReset() {
  jumpToCoord(0, 0, 1)
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement
      .requestFullscreen()
      .then(() => {
        isFullscreen.value = true
        window.dispatchEvent(new Event('resize'))
      })
      .catch(() => {
        console.warn('Fullscreen not supported')
      })
  } else {
    document.exitFullscreen().then(() => {
      isFullscreen.value = false
      window.dispatchEvent(new Event('resize'))
    })
  }
}

const onFullscreenChange = () => {
  isFullscreen.value = !!document.fullscreenElement
  window.dispatchEvent(new Event('resize'))
}

onMounted(() => {
  document.addEventListener('fullscreenchange', onFullscreenChange)
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', onFullscreenChange)
})
</script>

<style scoped>
.floating-controls {
  position: fixed;
  right: 14px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 90;
  align-items: flex-end;
}

.zoom-pill {
  position: fixed;
  right: 14px;
  top: 12px;
  z-index: 95;
  min-width: 58px;
  height: 28px;
  border-radius: 8px;
  border: 2px solid var(--ui-border);
  background: color-mix(in oklab, var(--morandi-cream) 76%, #000000 24%);
  color: #ffd6c7;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  box-shadow: var(--ui-shadow);
}

.control-btn {
  width: 42px;
  height: 42px;
  background: color-mix(in oklab, var(--morandi-cream) 72%, #000000 28%);
  border: 2px solid var(--ui-border);
  border-radius: 8px;
  color: var(--ui-ink);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  box-shadow: var(--ui-shadow);
}

.control-btn:hover {
  background: rgba(82, 66, 60, 0.95);
}

.control-btn svg {
  width: 18px;
  height: 18px;
}
</style>
