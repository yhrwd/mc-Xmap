import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import type { TileInfo, Marker } from '@/types'
import {
  camera,
  canvasSize,
  getVisibleTiles,
  worldToScreen,
  TILE_SIZE,
  hoveredMarkerId,
  tileIndex,
  isDragging,
} from '@/stores/mapStore'
import { loadTileImage, getCachedTile, preloadTiles } from '@/utils/tileCache'
import { getMipManifestUrl } from '@/config/mapSource'

type RenderTile = TileInfo & { worldSize?: number; level?: number }

interface MipLevelManifest {
  level: number
  worldSize: number
  tiles: Array<Pick<TileInfo, 'x' | 'z' | 'filename' | 'path'>>
}

interface MipManifest {
  tileSize: number
  xOffset: number
  levels: MipLevelManifest[]
}

interface MipLevelData {
  level: number
  worldSize: number
  lookup: Map<string, RenderTile>
}

const X_OFFSET = 512

function getTileKey(x: number, z: number): string {
  return `${x}_${z}`
}

export function useMapRenderer(canvasRef: Ref<HTMLCanvasElement | null>) {
  const ctx = ref<CanvasRenderingContext2D | null>(null)
  const offscreenCanvas = ref<HTMLCanvasElement | null>(null)
  const offscreenCtx = ref<CanvasRenderingContext2D | null>(null)
  const animationFrameId = ref<number | null>(null)
  const pendingRender = ref(false)
  const mipLevels = ref<MipLevelData[]>([])
  let loadJobId = 0

  async function loadMipManifest() {
    try {
      const response = await fetch(getMipManifestUrl())
      if (!response.ok) return

      const manifest = (await response.json()) as MipManifest
      if (!manifest.levels || manifest.levels.length === 0) return

      mipLevels.value = manifest.levels
        .map((level) => {
          const lookup = new Map<string, RenderTile>()
          for (const tile of level.tiles) {
            const renderTile: RenderTile = {
              col: 0,
              row: 0,
              x: tile.x,
              z: tile.z,
              filename: tile.filename,
              path: tile.path,
              worldSize: level.worldSize,
              level: level.level,
            }
            lookup.set(getTileKey(tile.x, tile.z), renderTile)
          }
          return {
            level: level.level,
            worldSize: level.worldSize,
            lookup,
          }
        })
        .sort((a, b) => a.level - b.level)
    } catch {
      mipLevels.value = []
    }
  }

  // 初始化 Canvas
  function initCanvas() {
    if (!canvasRef.value) return

    const canvas = canvasRef.value
    ctx.value = canvas.getContext('2d', { alpha: false })

    if (!ctx.value) {
      console.error('Failed to get canvas context')
      return
    }
    // 创建离屏 canvas 用于双缓冲
    offscreenCanvas.value = document.createElement('canvas')
    offscreenCtx.value = offscreenCanvas.value.getContext('2d', { alpha: false })

    if (!offscreenCtx.value) {
      console.error('Failed to create offscreen context')
      return
    }

    ctx.value.imageSmoothingEnabled = false
    offscreenCtx.value.imageSmoothingEnabled = false
    resizeCanvas()
  }

  // 调整画布尺寸
  function resizeCanvas() {
    if (!canvasRef.value || !ctx.value || !offscreenCanvas.value || !offscreenCtx.value) return

    const canvas = canvasRef.value
    const dpr = window.devicePixelRatio || 1

    const parent = canvas.parentElement
    if (parent) {
      canvasSize.value.width = parent.clientWidth
      canvasSize.value.height = parent.clientHeight
    }

    const width = canvasSize.value.width
    const height = canvasSize.value.height

    canvas.width = width * dpr
    canvas.height = height * dpr
    offscreenCanvas.value.width = width * dpr
    offscreenCanvas.value.height = height * dpr

    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    ctx.value.setTransform(1, 0, 0, 1, 0, 0)
    offscreenCtx.value.setTransform(1, 0, 0, 1, 0, 0)
    ctx.value.scale(dpr, dpr)
    offscreenCtx.value.scale(dpr, dpr)
    ctx.value.imageSmoothingEnabled = false
    offscreenCtx.value.imageSmoothingEnabled = false
  }

  function renderTileToOffscreen(tile: RenderTile) {
    if (!offscreenCtx.value) return

    const image = getCachedTile(tile)
    if (!image) return

    const screenPos = worldToScreen(tile.x, tile.z)
    const worldSize = tile.worldSize ?? TILE_SIZE
    const scaledSize = worldSize * camera.zoom
    offscreenCtx.value.drawImage(image, screenPos.x, screenPos.y, scaledSize, scaledSize)
  }

  function renderBlackBackgroundToOffscreen() {
    if (!offscreenCtx.value) return

    offscreenCtx.value.fillStyle = '#000000'
    offscreenCtx.value.fillRect(0, 0, canvasSize.value.width, canvasSize.value.height)
  }

  function renderMapBoundaryToOffscreen() {
    if (!offscreenCtx.value || !tileIndex.value) return

    const min = worldToScreen(tileIndex.value.minX, tileIndex.value.minZ)
    const max = worldToScreen(tileIndex.value.maxX + TILE_SIZE, tileIndex.value.maxZ + TILE_SIZE)
    const x = min.x
    const y = min.y
    const width = max.x - min.x
    const height = max.y - min.y

    offscreenCtx.value.save()
    if (isDragging.value && camera.zoom >= 4) {
      offscreenCtx.value.lineWidth = 2
      offscreenCtx.value.strokeStyle = 'rgba(255, 161, 136, 0.95)'
      offscreenCtx.value.setLineDash([])
      offscreenCtx.value.strokeRect(x, y, width, height)
      offscreenCtx.value.restore()
      return
    }

    offscreenCtx.value.lineWidth = 6
    offscreenCtx.value.strokeStyle = 'rgba(232, 122, 96, 0.25)'
    offscreenCtx.value.setLineDash([])
    offscreenCtx.value.strokeRect(x, y, width, height)

    offscreenCtx.value.lineWidth = 2.5
    offscreenCtx.value.strokeStyle = 'rgba(255, 161, 136, 0.96)'
    offscreenCtx.value.setLineDash([10, 7])
    offscreenCtx.value.strokeRect(x, y, width, height)

    // corner accents
    const corner = 18
    offscreenCtx.value.setLineDash([])
    offscreenCtx.value.lineWidth = 3
    offscreenCtx.value.strokeStyle = 'rgba(255, 196, 182, 0.95)'
    offscreenCtx.value.beginPath()
    offscreenCtx.value.moveTo(x, y + corner)
    offscreenCtx.value.lineTo(x, y)
    offscreenCtx.value.lineTo(x + corner, y)
    offscreenCtx.value.moveTo(x + width - corner, y)
    offscreenCtx.value.lineTo(x + width, y)
    offscreenCtx.value.lineTo(x + width, y + corner)
    offscreenCtx.value.moveTo(x, y + height - corner)
    offscreenCtx.value.lineTo(x, y + height)
    offscreenCtx.value.lineTo(x + corner, y + height)
    offscreenCtx.value.moveTo(x + width - corner, y + height)
    offscreenCtx.value.lineTo(x + width, y + height)
    offscreenCtx.value.lineTo(x + width, y + height - corner)
    offscreenCtx.value.stroke()
    offscreenCtx.value.restore()
  }

  function renderMarkersToOffscreen(markers: Marker[]) {
    if (!offscreenCtx.value) return
    const lightweight = isDragging.value && camera.zoom >= 4

    for (const marker of markers) {
      const screenPos = worldToScreen(marker.x, marker.z)
      const isHovered = hoveredMarkerId.value === marker.id

      if (
        screenPos.x < -30 ||
        screenPos.x > canvasSize.value.width + 30 ||
        screenPos.y < -30 ||
        screenPos.y > canvasSize.value.height + 30
      ) {
        continue
      }

      const radius = lightweight
        ? 4.5
        : Math.min(7, Math.max(4, 4.5 * camera.zoom)) + (isHovered ? 1 : 0)

      offscreenCtx.value.beginPath()
      offscreenCtx.value.arc(screenPos.x, screenPos.y, radius + 2, 0, Math.PI * 2)
      offscreenCtx.value.fillStyle = isHovered ? '#fef3c7' : '#ffffff'
      offscreenCtx.value.fill()

      offscreenCtx.value.beginPath()
      offscreenCtx.value.arc(screenPos.x, screenPos.y, radius, 0, Math.PI * 2)
      offscreenCtx.value.fillStyle = marker.color
      offscreenCtx.value.fill()

      // 名称仅在悬浮时显示，避免重复和遮挡
      if (!lightweight && isHovered) {
        const text = marker.name
        offscreenCtx.value.font = '12px "Microsoft YaHei", sans-serif'
        const textWidth = offscreenCtx.value.measureText(text).width
        const boxWidth = textWidth + 18
        const boxHeight = 24
        const boxX = screenPos.x - boxWidth / 2
        const boxY = screenPos.y - radius - boxHeight - 10

        offscreenCtx.value.fillStyle = 'rgba(34, 31, 30, 0.9)'
        offscreenCtx.value.fillRect(boxX, boxY, boxWidth, boxHeight)

        offscreenCtx.value.fillStyle = '#f8f0e9'
        offscreenCtx.value.textAlign = 'center'
        offscreenCtx.value.textBaseline = 'middle'
        offscreenCtx.value.fillText(text, screenPos.x, boxY + boxHeight / 2 + 0.5)
      }
    }
  }

  function copyToDisplay() {
    if (!ctx.value || !offscreenCanvas.value) return

    const dpr = window.devicePixelRatio || 1
    ctx.value.setTransform(1, 0, 0, 1, 0, 0)

    ctx.value.drawImage(
      offscreenCanvas.value,
      0,
      0,
      canvasSize.value.width * dpr,
      canvasSize.value.height * dpr,
      0,
      0,
      canvasSize.value.width * dpr,
      canvasSize.value.height * dpr,
    )

    ctx.value.scale(dpr, dpr)
  }

  function selectMipLevel(): MipLevelData | null {
    if (mipLevels.value.length === 0) return null
    const targetScreenSize = camera.zoom <= 0.1 ? 260 : 160
    const firstLevel = mipLevels.value[0]
    if (!firstLevel) return null
    let best: MipLevelData = firstLevel
    let bestScore = Infinity

    for (const level of mipLevels.value) {
      const screenSize = level.worldSize * camera.zoom
      let score = Math.abs(screenSize - targetScreenSize)
      if (screenSize < 28) score += (28 - screenSize) * 4
      if (score < bestScore) {
        best = level
        bestScore = score
      }
    }

    // 低缩放优先选择更粗层，降低 drawImage 次数
    if (camera.zoom <= 0.1) {
      const forcedLevel = mipLevels.value.find((l) => l.level >= 1)
      if (forcedLevel && forcedLevel.level > best.level) best = forcedLevel
    }
    if (camera.zoom <= 0.06) {
      const forcedLevel = mipLevels.value.find((l) => l.level >= 2)
      if (forcedLevel && forcedLevel.level > best.level) best = forcedLevel
    }
    if (camera.zoom <= 0.035) {
      const forcedLevel = mipLevels.value.find((l) => l.level >= 3)
      if (forcedLevel && forcedLevel.level > best.level) best = forcedLevel
    }
    return best
  }

  function getVisibleTilesForLevel(level: MipLevelData): RenderTile[] {
    const halfWidth = canvasSize.value.width / 2 / camera.zoom
    const halfHeight = canvasSize.value.height / 2 / camera.zoom
    const bounds = {
      minX: camera.x - halfWidth,
      maxX: camera.x + halfWidth,
      minZ: camera.z - halfHeight,
      maxZ: camera.z + halfHeight,
    }

    const step = level.worldSize
    const startX = Math.floor((bounds.minX - X_OFFSET) / step) * step + X_OFFSET
    const endX = Math.floor((bounds.maxX - X_OFFSET) / step) * step + X_OFFSET
    const startZ = Math.floor(bounds.minZ / step) * step
    const endZ = Math.floor(bounds.maxZ / step) * step

    const visible: RenderTile[] = []
    for (let x = startX; x <= endX; x += step) {
      for (let z = startZ; z <= endZ; z += step) {
        const tile = level.lookup.get(getTileKey(x, z))
        if (tile) visible.push(tile)
      }
    }
    return visible
  }

  function getActiveVisibleTiles(): RenderTile[] {
    const selectedLevel = selectMipLevel()
    if (!selectedLevel || selectedLevel.level === 0) {
      return getVisibleTiles()
    }
    return getVisibleTilesForLevel(selectedLevel)
  }

  function renderSync(markers: Marker[] = []) {
    if (!offscreenCtx.value) return

    renderBlackBackgroundToOffscreen()
    const visibleTiles = getActiveVisibleTiles()

    for (const tile of visibleTiles) {
      if (getCachedTile(tile)) {
        renderTileToOffscreen(tile)
      }
    }

    renderMapBoundaryToOffscreen()
    renderMarkersToOffscreen(markers)
    copyToDisplay()
  }

  async function loadMissingTiles(markers: Marker[] = []) {
    const jobId = ++loadJobId
    const visibleTiles = getActiveVisibleTiles()
    const missingTiles = visibleTiles.filter((tile) => !getCachedTile(tile))
    if (missingTiles.length === 0) {
      void preloadSurroundingTiles()
      return
    }

    missingTiles.sort((a, b) => {
      const da = (a.x - camera.x) ** 2 + (a.z - camera.z) ** 2
      const db = (b.x - camera.x) ** 2 + (b.z - camera.z) ** 2
      return da - db
    })

    const selectedLevel = selectMipLevel()
    const levelSize = selectedLevel?.worldSize ?? TILE_SIZE
    const concurrency =
      camera.zoom >= 4
        ? 1
        : levelSize >= TILE_SIZE * 8
          ? 10
          : camera.zoom <= 0.2
            ? 16
            : camera.zoom <= 0.5
              ? 10
              : 6

    let cursor = 0
    let loadedCount = 0

    const workers = Array.from({ length: concurrency }, async () => {
      while (cursor < missingTiles.length) {
        const currentIndex = cursor++
        const tile = missingTiles[currentIndex]
        if (!tile || jobId !== loadJobId) return

        await loadTileImage(tile, 'high')
        loadedCount++

        const refreshBatch = camera.zoom >= 4 ? 36 : 12
        if (loadedCount % refreshBatch === 0 && jobId === loadJobId) {
          requestRender(markers)
        }
      }
    })

    await Promise.all(workers)
    if (jobId !== loadJobId) return

    requestRender(markers)
    void preloadSurroundingTiles()
  }

  function requestRender(markers: Marker[] = []) {
    if (pendingRender.value) return

    pendingRender.value = true
    animationFrameId.value = requestAnimationFrame(() => {
      pendingRender.value = false
      renderSync(markers)
    })
  }

  async function preloadSurroundingTiles() {
    const selectedLevel = selectMipLevel()
    const visibleTiles =
      selectedLevel && selectedLevel.level > 0 ? getVisibleTilesForLevel(selectedLevel) : getVisibleTiles()
    if (visibleTiles.length === 0) return

    const worldSize = selectedLevel?.worldSize ?? TILE_SIZE
    const ring = camera.zoom <= 0.2 ? 2 : 1
    const bounds = {
      minX: Math.min(...visibleTiles.map((t) => t.x)) - worldSize * ring,
      maxX: Math.max(...visibleTiles.map((t) => t.x)) + worldSize * ring,
      minZ: Math.min(...visibleTiles.map((t) => t.z)) - worldSize * ring,
      maxZ: Math.max(...visibleTiles.map((t) => t.z)) + worldSize * ring,
    }

    const visibleSet = new Set(visibleTiles.map((tile) => getTileKey(tile.x, tile.z)))
    const tilesToPreload: RenderTile[] = []

    const step = worldSize
    const levelLookup = selectedLevel?.lookup
    const baseVisible = !levelLookup ? getVisibleTiles() : []
    const baseMap =
      !levelLookup && baseVisible.length > 0
        ? new Map(baseVisible.map((tile) => [getTileKey(tile.x, tile.z), tile]))
        : null

    for (let x = bounds.minX; x <= bounds.maxX; x += step) {
      for (let z = bounds.minZ; z <= bounds.maxZ; z += step) {
        const key = getTileKey(x, z)
        if (visibleSet.has(key)) continue
        const tile = levelLookup?.get(key) || baseMap?.get(key)
        if (tile && !getCachedTile(tile)) {
          tilesToPreload.push(tile as RenderTile)
        }
      }
    }

    const limit = camera.zoom <= 0.2 ? 48 : 24
    await preloadTiles(tilesToPreload.slice(0, limit))
  }

  onMounted(() => {
    initCanvas()
    void loadMipManifest()
    window.addEventListener('resize', resizeCanvas)
  })

  onUnmounted(() => {
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value)
    }
    window.removeEventListener('resize', resizeCanvas)
  })

  return {
    ctx,
    resizeCanvas,
    requestRender,
    preloadSurroundingTiles,
    loadMissingTiles,
  }
}
