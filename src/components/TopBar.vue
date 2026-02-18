<template>
  <div class="top-bar">
    <div class="jump-box">
      <input v-model.number="jumpX" type="number" placeholder="X 坐标" @keyup.enter="handleJump" />
      <input v-model.number="jumpZ" type="number" placeholder="Z 坐标" @keyup.enter="handleJump" />
      <button @click="handleJump">跳转</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { jumpToCoord } from '@/stores/mapStore'

const jumpX = ref(0)
const jumpZ = ref(0)

function handleJump() {
  jumpToCoord(jumpX.value, jumpZ.value)
}
</script>

<style scoped>
.top-bar {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
}

.jump-box {
  pointer-events: auto;
  position: fixed;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  align-items: center;
  border: 2px solid var(--ui-border);
  border-radius: 10px;
  background: color-mix(in oklab, var(--morandi-cream) 74%, #000000 26%);
  box-shadow: var(--ui-shadow);
  padding: 8px;
}

.jump-box input {
  width: 124px;
  height: 34px;
  border-radius: 8px;
  border: 2px solid var(--ui-border);
  background: rgba(25, 20, 18, 0.75);
  color: var(--ui-ink);
  padding: 0 10px;
  outline: none;
}

.jump-box button {
  height: 34px;
  border: 2px solid var(--ui-border);
  border-radius: 8px;
  padding: 0 14px;
  color: #f8ede5;
  background: color-mix(in oklab, var(--morandi-clay) 52%, #000000 48%);
  cursor: pointer;
}

@media (max-width: 768px) {
  .top-bar {
    top: 0;
    left: 0;
    right: 0;
    height: 52px;
    inset: auto;
    pointer-events: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--ui-border);
    background: color-mix(in oklab, var(--morandi-cream) 74%, #000000 26%);
    box-shadow: var(--ui-shadow);
  }

  .jump-box {
    position: static;
    transform: none;
    width: calc(100% - 18px);
    border: none;
    border-radius: 0;
    box-shadow: none;
    padding: 0;
  }

  .jump-box input {
    width: 100%;
    min-width: 0;
    flex: 1;
  }
}
</style>
