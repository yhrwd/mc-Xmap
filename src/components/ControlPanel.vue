<template>
  <div class="marker-fab-wrap">
    <button class="marker-fab" :class="{ open: expanded }" @click="expanded = !expanded" title="标记列表">
      标记
      <span>{{ filteredMarkers.length }}</span>
    </button>
  </div>

  <Transition name="list-pop">
    <div v-if="expanded" class="marker-popover">
      <div class="header">标记列表</div>
      <div class="search-box">
        <input v-model="searchQuery" type="text" placeholder="搜索名称或坐标" />
      </div>
      <div class="marker-list">
        <button
          v-for="marker in filteredMarkers"
          :key="marker.id"
          class="marker-item"
          @click="jumpToMarker(marker)"
        >
          <span class="dot" :style="{ backgroundColor: marker.color }"></span>
          <span class="name">{{ marker.name }}</span>
          <span class="coord">{{ marker.x }}, {{ marker.z }}</span>
        </button>
        <div v-if="filteredMarkers.length === 0" class="empty">没有匹配标记</div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { jumpToCoord, markers, searchMarkers } from '@/stores/mapStore'
import type { Marker } from '@/types'

const expanded = ref(false)
const searchQuery = ref('')

const filteredMarkers = computed(() => {
  if (!searchQuery.value.trim()) return markers.value
  return searchMarkers(searchQuery.value)
})

function jumpToMarker(marker: Marker) {
  jumpToCoord(marker.x, marker.z)
  expanded.value = false
}
</script>

<style scoped>
.marker-fab-wrap {
  position: fixed;
  left: 14px;
  top: 14px;
  z-index: 97;
}

.marker-fab {
  border: 2px solid var(--ui-border);
  border-radius: 8px;
  height: 38px;
  padding: 0 12px;
  background: linear-gradient(
    145deg,
    color-mix(in oklab, var(--morandi-cream) 68%, #000000 32%),
    color-mix(in oklab, var(--morandi-stone) 78%, #000000 22%)
  );
  color: var(--ui-ink);
  cursor: pointer;
  display: flex;
  gap: 12px;
  align-items: center;
  box-shadow: var(--ui-shadow);
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
  font-weight: 600;
}

.marker-fab span {
  display: inline-flex;
  min-width: 20px;
  height: 20px;
  border-radius: 10px;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: color-mix(in oklab, var(--morandi-clay) 74%, #000000 26%);
  color: #fff;
}

.marker-fab.open {
  border-color: var(--ui-border);
  transform: translateY(-1px);
  background: linear-gradient(
    145deg,
    color-mix(in oklab, var(--morandi-clay) 20%, var(--morandi-cream) 80%),
    color-mix(in oklab, var(--morandi-stone) 76%, #000000 24%)
  );
}

.marker-fab:hover {
  background: rgba(82, 66, 60, 0.95);
}

.marker-popover {
  position: fixed;
  left: 14px;
  top: 64px;
  z-index: 97;
  width: min(380px, calc(100vw - 28px));
  max-height: min(68vh, 560px);
  border: 1px solid color-mix(in oklab, var(--morandi-clay) 48%, #000000 52%);
  border-radius: 16px;
  background: linear-gradient(
    160deg,
    color-mix(in oklab, var(--morandi-cream) 90%, #000000 10%),
    color-mix(in oklab, var(--morandi-stone) 78%, #000000 22%)
  );
  box-shadow: var(--ui-shadow);
  padding: 10px 10px 10px;
  display: flex;
  flex-direction: column;
}

.header {
  font-size: 11px;
  color: #f2b8a3;
  margin-bottom: 8px;
  letter-spacing: 0.4px;
}

.search-box input {
  width: 100%;
  height: 34px;
  border-radius: 10px;
  border: 1px solid var(--ui-border);
  background: rgba(25, 20, 18, 0.75);
  color: var(--ui-ink);
  padding: 0 10px;
  outline: none;
  transition: border-color 0.14s ease, box-shadow 0.14s ease;
}

.search-box input:focus {
  border-color: color-mix(in oklab, var(--morandi-clay) 62%, #000000 38%);
  box-shadow: 0 0 0 2px rgba(232, 122, 96, 0.22);
}

.marker-list {
  margin-top: 8px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 2px;
}

.marker-item {
  border: 2px solid var(--ui-border);
  border-radius: 8px;
  background: rgba(21, 17, 15, 0.82);
  color: var(--ui-ink);
  cursor: pointer;
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 8px 9px;
  transition: border-color 0.14s ease, transform 0.14s ease, background 0.14s ease;
}

.marker-item:hover {
  border-color: var(--ui-border);
  background: rgba(44, 34, 30, 0.9);
  transform: translateX(1px);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.name {
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.coord {
  font-size: 10px;
  color: var(--ui-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.empty {
  text-align: center;
  color: var(--ui-muted);
  font-size: 12px;
  padding: 12px;
}

.list-pop-enter-active,
.list-pop-leave-active {
  transition: all 0.18s ease;
}

.list-pop-enter-from,
.list-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 768px) {
  .marker-fab-wrap {
    left: 10px;
    top: 60px;
  }

  .marker-popover {
    left: 10px;
    top: 104px;
  }
}
</style>
