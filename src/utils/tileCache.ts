import type { TileInfo, TileCacheItem } from '@/types'
import { resolveTileResource } from '@/config/mapSource'

// 最大缓存瓦片数
const MAX_CACHE_SIZE = 512

// 瓦片缓存
const tileCache = new Map<string, TileCacheItem>()

// 加载中的瓦片
const loadingTiles = new Map<string, Promise<HTMLImageElement | null>>()

// 支持的图片格式
const SUPPORTED_FORMATS = ['.webp', '.png', '.jpg', '.jpeg']

// 获取缓存键
function getCacheKey(tile: TileInfo): string {
  return tile.path || `${tile.x}_${tile.z}_${tile.filename}`
}

// 尝试加载图片，支持多种格式
async function tryLoadImage(
  basePath: string,
  priority: 'high' | 'low' = 'high',
): Promise<HTMLImageElement | null> {
  // 如果路径已经有扩展名，先尝试原路径
  const hasExtension = SUPPORTED_FORMATS.some((ext) => basePath.toLowerCase().endsWith(ext))

  const pathsToTry: string[] = []

  if (hasExtension) {
    pathsToTry.push(basePath)
  } else {
    // 尝试各种格式
    for (const ext of SUPPORTED_FORMATS) {
      pathsToTry.push(basePath + ext)
    }
  }

  for (const path of pathsToTry) {
    try {
      const image = new Image()
      image.crossOrigin = 'anonymous'
      image.decoding = 'async'
      image.fetchPriority = priority

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Load timeout'))
        }, 10000)

        image.onload = () => {
          clearTimeout(timeout)
          resolve()
        }
        image.onerror = () => {
          clearTimeout(timeout)
          reject(new Error(`Failed to load: ${path}`))
        }
        image.src = path
      })

      return image
    } catch {
      // 继续尝试下一个格式
      continue
    }
  }

  return null
}

// 加载瓦片图片
export async function loadTileImage(
  tile: TileInfo,
  priority: 'high' | 'low' = 'high',
): Promise<HTMLImageElement | null> {
  const key = getCacheKey(tile)

  // 检查缓存
  const cached = tileCache.get(key)
  if (cached) {
    cached.lastUsed = Date.now()
    return cached.image
  }

  // 检查是否正在加载
  const inFlight = loadingTiles.get(key)
  if (inFlight) {
    return inFlight
  }

  const loadPromise = (async () => {
    try {
      // 构建正确路径：优先使用 tile.path（支持 mip 子目录），否则走默认 tiles 根目录
      const normalizedPath = resolveTileResource(tile.path || tile.filename)
      const basePath = normalizedPath.replace(/\.[^/.]+$/, '')

      // 尝试加载图片（支持多种格式）
      const image = await tryLoadImage(basePath, priority)

      if (image) {
        // 添加到缓存
        addToCache(key, image)
        return image
      }

      console.warn('All image format attempts failed:', basePath)
      return null
    } catch (error) {
      console.warn('Failed to load tile:', tile.path, error)
      return null
    } finally {
      loadingTiles.delete(key)
    }
  })()

  loadingTiles.set(key, loadPromise)
  return loadPromise
}

// 添加到缓存
function addToCache(key: string, image: HTMLImageElement) {
  // 如果缓存已满，删除最久未使用的
  if (tileCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null
    let oldestTime = Infinity

    for (const [k, v] of tileCache.entries()) {
      if (v.lastUsed < oldestTime) {
        oldestTime = v.lastUsed
        oldestKey = k
      }
    }

    if (oldestKey) {
      tileCache.delete(oldestKey)
    }
  }

  tileCache.set(key, {
    image,
    lastUsed: Date.now(),
  })
}

// 预加载瓦片
export async function preloadTiles(tiles: TileInfo[]): Promise<void> {
  const promises = tiles.map((tile) => loadTileImage(tile, 'low'))
  await Promise.all(promises)
}

// 获取已缓存的瓦片图片
export function getCachedTile(tile: TileInfo): HTMLImageElement | null {
  const key = getCacheKey(tile)
  const cached = tileCache.get(key)

  if (cached) {
    cached.lastUsed = Date.now()
    return cached.image
  }

  return null
}

// 清除缓存
export function clearTileCache() {
  tileCache.clear()
  loadingTiles.clear()
}

// 获取缓存统计
export function getCacheStats() {
  return {
    cached: tileCache.size,
    loading: loadingTiles.size,
  }
}
