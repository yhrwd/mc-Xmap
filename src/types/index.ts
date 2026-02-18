// 世界坐标
export interface WorldCoord {
  x: number
  z: number
}

// 屏幕坐标
export interface ScreenCoord {
  x: number
  y: number
}

// 瓦片信息
export interface TileInfo {
  col: number
  row: number
  x: number
  z: number
  filename: string
  path: string
}

// 瓦片索引
export interface TileIndex {
  tiles: TileInfo[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// 标记
export interface Marker {
  id: string
  name: string
  x: number
  z: number
  color: string
  icon?: string
  description?: string
}

// 相机状态
export interface CameraState {
  x: number
  z: number
  zoom: number
}

// 视口边界
export interface ViewportBounds {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

// 瓦片缓存项
export interface TileCacheItem {
  image: HTMLImageElement
  lastUsed: number
}

// 加载状态
export type TileLoadState = 'idle' | 'loading' | 'loaded' | 'error'

// 触摸点
export interface TouchPoint {
  id: number
  x: number
  y: number
}
