import { ref, computed, reactive } from 'vue'
import type { WorldCoord, CameraState, Marker, TileIndex, TileInfo } from '@/types'
import { getMarkersUrl, getTileIndexUrl } from '@/config/mapSource'

// 瓦片尺寸常量
export const TILE_SIZE = 1024
export const MIN_ZOOM = 0.05
export const MAX_ZOOM = 8

// 默认相机状态
const defaultCamera: CameraState = {
  x: 0,
  z: 0,
  zoom: 1,
}

// 相机状态
export const camera = reactive<CameraState>({ ...defaultCamera })

// 鼠标/触摸位置对应的世界坐标
export const mouseWorldCoord = ref<WorldCoord>({ x: 0, z: 0 })

// 瓦片索引
export const tileIndex = ref<TileIndex | null>(null)
let tileLookup = new Map<string, TileInfo>()

// 标记列表
export const markers = ref<Marker[]>([])
export const hoveredMarkerId = ref<string | null>(null)

// 画布尺寸
export const canvasSize = ref({ width: 0, height: 0 })

// 是否正在拖拽
export const isDragging = ref(false)
export const isMarkerPickMode = ref(false)
export const markerDraftCoord = ref<WorldCoord | null>(null)

function getTileKey(x: number, z: number): string {
  return `${x}_${z}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function getCameraLimits() {
  if (!tileIndex.value || tileIndex.value.tiles.length === 0) {
    return null
  }

  const halfWidth = canvasSize.value.width / 2 / camera.zoom
  const halfHeight = canvasSize.value.height / 2 / camera.zoom

  // x 为瓦片左上角世界坐标，z 同理，因此需要加一个 TILE_SIZE 覆盖完整区域
  const worldMinX = tileIndex.value.minX
  const worldMaxX = tileIndex.value.maxX + TILE_SIZE
  const worldMinZ = tileIndex.value.minZ
  const worldMaxZ = tileIndex.value.maxZ + TILE_SIZE

  const minX = worldMinX + halfWidth
  const maxX = worldMaxX - halfWidth
  const minZ = worldMinZ + halfHeight
  const maxZ = worldMaxZ - halfHeight

  return {
    minX: minX <= maxX ? minX : (worldMinX + worldMaxX) / 2,
    maxX: minX <= maxX ? maxX : (worldMinX + worldMaxX) / 2,
    minZ: minZ <= maxZ ? minZ : (worldMinZ + worldMaxZ) / 2,
    maxZ: minZ <= maxZ ? maxZ : (worldMinZ + worldMaxZ) / 2,
  }
}

export function clampCameraPosition() {
  const limits = getCameraLimits()
  if (!limits) return

  camera.x = clamp(camera.x, limits.minX, limits.maxX)
  camera.z = clamp(camera.z, limits.minZ, limits.maxZ)
}

// 计算属性：当前缩放百分比
export const zoomPercent = computed(() => Math.round(camera.zoom * 100))

// 计算属性：视口边界的世界坐标
export const viewportBounds = computed(() => {
  const halfWidth = canvasSize.value.width / 2 / camera.zoom
  const halfHeight = canvasSize.value.height / 2 / camera.zoom

  return {
    minX: camera.x - halfWidth,
    maxX: camera.x + halfWidth,
    minZ: camera.z - halfHeight,
    maxZ: camera.z + halfHeight,
  }
})

// 世界坐标转屏幕坐标
export function worldToScreen(worldX: number, worldZ: number): { x: number; y: number } {
  return {
    x: (worldX - camera.x) * camera.zoom + canvasSize.value.width / 2,
    y: (worldZ - camera.z) * camera.zoom + canvasSize.value.height / 2,
  }
}

// 屏幕坐标转世界坐标
export function screenToWorld(screenX: number, screenY: number): { x: number; z: number } {
  return {
    x: (screenX - canvasSize.value.width / 2) / camera.zoom + camera.x,
    z: (screenY - canvasSize.value.height / 2) / camera.zoom + camera.z,
  }
}

// 根据世界坐标获取瓦片信息
// 使用坐标直接匹配，不依赖行列号
export function getTileAtWorldCoord(worldX: number, worldZ: number): TileInfo | null {
  if (!tileIndex.value) return null

  // 计算该坐标所属的瓦片坐标
  // x 坐标模 1024 都等于 512，所以瓦片中心在 x = n * 1024 + 512
  // z 坐标是 1024 的整数倍，所以瓦片起始在 z = n * 1024
  const tileX = Math.floor((worldX - 512) / TILE_SIZE) * TILE_SIZE + 512
  const tileZ = Math.floor(worldZ / TILE_SIZE) * TILE_SIZE

  return tileLookup.get(getTileKey(tileX, tileZ)) || null
}

export function getTileByCoord(tileX: number, tileZ: number): TileInfo | null {
  return tileLookup.get(getTileKey(tileX, tileZ)) || null
}

// 获取视口内需要加载的瓦片列表
// 使用坐标范围匹配，不依赖行列号
export function getVisibleTiles(): TileInfo[] {
  if (!tileIndex.value) return []

  const bounds = viewportBounds.value
  const visibleTiles: TileInfo[] = []

  // 计算需要加载的瓦片坐标范围
  const startTileX = Math.floor((bounds.minX - 512) / TILE_SIZE) * TILE_SIZE + 512
  const endTileX = Math.floor((bounds.maxX - 512) / TILE_SIZE) * TILE_SIZE + 512
  const startTileZ = Math.floor(bounds.minZ / TILE_SIZE) * TILE_SIZE
  const endTileZ = Math.floor(bounds.maxZ / TILE_SIZE) * TILE_SIZE

  // 遍历所有可能的瓦片位置
  for (let x = startTileX; x <= endTileX; x += TILE_SIZE) {
    for (let z = startTileZ; z <= endTileZ; z += TILE_SIZE) {
      // 在索引中查找该坐标的瓦片
      const tile = tileLookup.get(getTileKey(x, z))
      if (tile) {
        visibleTiles.push(tile)
      }
    }
  }

  return visibleTiles
}

export function setMarkerDraftFromWorld(x: number, z: number) {
  markerDraftCoord.value = {
    x: Math.round(x),
    z: Math.round(z),
  }
}

// 跳转到指定坐标
export function jumpToCoord(x: number, z: number, newZoom?: number) {
  camera.x = x
  camera.z = z
  if (newZoom !== undefined) {
    camera.zoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM)
  }
  clampCameraPosition()
}

// 设置缩放
export function setZoom(newZoom: number, centerX?: number, centerY?: number) {
  const clampedZoom = clamp(newZoom, MIN_ZOOM, MAX_ZOOM)

  if (centerX !== undefined && centerY !== undefined) {
    // 以指定点为中心缩放
    const worldBefore = screenToWorld(centerX, centerY)
    camera.zoom = clampedZoom
    const worldAfter = screenToWorld(centerX, centerY)

    camera.x += worldBefore.x - worldAfter.x
    camera.z += worldBefore.z - worldAfter.z
  } else {
    camera.zoom = clampedZoom
  }

  clampCameraPosition()
}

// 加载瓦片索引 mapStore.ts
export async function loadTileIndex(): Promise<void> {
  try {
    const response = await fetch(getTileIndexUrl())
    if (response.ok) {
      tileIndex.value = await response.json()
      console.log('Tile index loaded:', tileIndex.value?.tiles.length, 'tiles')
      // 使用可选链 ?. 避免空值访问，空值合并 ?? 提供默认空数组
      tileLookup = new Map(
        tileIndex.value?.tiles.map((tile) => [getTileKey(tile.x, tile.z), tile]) ?? [],
      )
      // 保持默认视角为 0,0；仅做一次边界修正，避免落在数据范围外
      clampCameraPosition()
    }
  } catch (error) {
    console.warn('Failed to load tile index:', error)
    // 创建空索引
    tileIndex.value = {
      tiles: [],
      minX: 0,
      maxX: 0,
      minZ: 0,
      maxZ: 0,
    }
    tileLookup = new Map()
  }
}

// 加载标记
export async function loadMarkers(): Promise<void> {
  try {
    const response = await fetch(getMarkersUrl())
    if (response.ok) {
      markers.value = await response.json()
      console.log('Markers loaded:', markers.value.length)
    }
  } catch (error) {
    console.warn('Failed to load markers:', error)
    markers.value = []
  }
}

// 添加标记
export function addMarker(marker: Omit<Marker, 'id'>): Marker {
  const newMarker: Marker = {
    ...marker,
    id: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  }
  markers.value.push(newMarker)
  return newMarker
}

// 删除标记
export function removeMarker(id: string) {
  const index = markers.value.findIndex((m) => m.id === id)
  if (index > -1) {
    markers.value.splice(index, 1)
  }
}

// 搜索标记
export function searchMarkers(query: string): Marker[] {
  const lowerQuery = query.toLowerCase()
  return markers.value.filter(
    (m) =>
      m.name.toLowerCase().includes(lowerQuery) ||
      m.x.toString().includes(query) ||
      m.z.toString().includes(query),
  )
}

// 重置相机
export function resetCamera() {
  camera.x = defaultCamera.x
  camera.z = defaultCamera.z
  camera.zoom = defaultCamera.zoom
  clampCameraPosition()
}
