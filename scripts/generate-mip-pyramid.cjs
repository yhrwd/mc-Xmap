#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('Error: sharp is not installed. Run: npm install sharp')
  process.exit(1)
}

const TILE_SIZE = 1024
const X_OFFSET = 512

function getKey(x, z) {
  return `${x}_${z}`
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  const fixed = value >= 10 || idx === 0 ? 0 : 1
  return `${value.toFixed(fixed)}${units[idx]}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    tilesDir: path.resolve(args[0] || path.join(process.cwd(), 'public', 'tiles')),
    maxLevels: Math.max(1, Number(args[1] || 6)),
  }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function clearDir(dir) {
  if (!fs.existsSync(dir)) return
  for (const item of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, item), { recursive: true, force: true })
  }
}

function parentCoord(childX, childZ, parentStep) {
  const x = Math.floor((childX - X_OFFSET) / parentStep) * parentStep + X_OFFSET
  const z = Math.floor(childZ / parentStep) * parentStep
  return { x, z }
}

async function buildParentTile(group, prevWorldSize, outputPath) {
  const half = TILE_SIZE / 2
  const composites = []

  for (const child of group.children) {
    const dx = Math.round((child.x - group.x) / prevWorldSize)
    const dy = Math.round((child.z - group.z) / prevWorldSize)
    const left = dx * half
    const top = dy * half
    if (left < 0 || left > half || top < 0 || top > half) continue

    const input = await sharp(child.sourcePath).resize(half, half, { fit: 'fill' }).toBuffer()
    composites.push({ input, left, top })
  }

  await sharp({
    create: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite(composites)
    .webp({ quality: 82, effort: 4 })
    .toFile(outputPath)
}

async function main() {
  const { tilesDir, maxLevels } = parseArgs()
  const indexPath = path.join(tilesDir, 'tile-index.json')
  const mipRoot = path.join(tilesDir, 'mip')
  const startedAt = Date.now()
  let peakRss = 0
  let peakHeap = 0

  const usageText = () => {
    const mem = process.memoryUsage()
    if (mem.rss > peakRss) peakRss = mem.rss
    if (mem.heapUsed > peakHeap) peakHeap = mem.heapUsed
    return `rss=${formatBytes(mem.rss)}, heap=${formatBytes(mem.heapUsed)}`
  }

  if (!fs.existsSync(indexPath)) {
    console.error(`Error: tile-index.json not found at ${indexPath}`)
    process.exit(1)
  }

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  const baseTiles = index.tiles || []
  if (baseTiles.length === 0) {
    console.error('Error: no base tiles in tile-index.json')
    process.exit(1)
  }

  console.log(`MIP start: baseTiles=${baseTiles.length}, maxLevels=${maxLevels}, tilesDir=${tilesDir}`)
  console.log('L0 uses existing base tiles from tile-index.json (no new files generated).')

  clearDir(mipRoot)
  ensureDir(mipRoot)

  const levels = []

  let currentLevelTiles = baseTiles.map((t) => ({
    x: t.x,
    z: t.z,
    filename: t.filename,
    path: `/tiles/${t.filename}`,
    sourcePath: path.join(tilesDir, t.filename),
  }))

  levels.push({
    level: 0,
    worldSize: TILE_SIZE,
    minX: index.minX,
    maxX: index.maxX,
    minZ: index.minZ,
    maxZ: index.maxZ,
    count: currentLevelTiles.length,
    tiles: currentLevelTiles.map((t) => ({ x: t.x, z: t.z, filename: t.filename, path: t.path })),
  })

  for (let level = 1; level <= maxLevels; level++) {
    const levelStarted = Date.now()
    const prevWorldSize = TILE_SIZE * 2 ** (level - 1)
    const worldSize = prevWorldSize * 2
    const levelDir = path.join(mipRoot, `l${level}`)
    ensureDir(levelDir)

    const grouped = new Map()
    for (const tile of currentLevelTiles) {
      const parent = parentCoord(tile.x, tile.z, worldSize)
      const key = getKey(parent.x, parent.z)
      const existing = grouped.get(key)
      if (existing) {
        existing.children.push(tile)
      } else {
        grouped.set(key, { x: parent.x, z: parent.z, children: [tile] })
      }
    }

    const groups = Array.from(grouped.values())
    const nextTiles = []
    let completed = 0
    console.log(`L${level} building: parents=${groups.length}, fromChildren=${currentLevelTiles.length}`)
    for (const group of groups) {
      const filename = `${group.x}_${group.z}.webp`
      const outputPath = path.join(levelDir, filename)
      await buildParentTile(group, prevWorldSize, outputPath)
      nextTiles.push({
        x: group.x,
        z: group.z,
        filename,
        path: `/tiles/mip/l${level}/${filename}`,
        sourcePath: outputPath,
      })
      completed += 1
      if (completed % 200 === 0 || completed === groups.length) {
        console.log(`[L${level}] [${completed}/${groups.length}] ${usageText()}`)
      }
    }

    if (nextTiles.length === 0) break

    const xs = nextTiles.map((t) => t.x)
    const zs = nextTiles.map((t) => t.z)
    levels.push({
      level,
      worldSize,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      count: nextTiles.length,
      tiles: nextTiles.map((t) => ({ x: t.x, z: t.z, filename: t.filename, path: t.path })),
    })

    currentLevelTiles = nextTiles
    const levelElapsed = ((Date.now() - levelStarted) / 1000).toFixed(1)
    console.log(`L${level} done: tiles=${nextTiles.length}, elapsed=${levelElapsed}s`)
    if (nextTiles.length <= 1) break
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    tileSize: TILE_SIZE,
    xOffset: X_OFFSET,
    levels,
  }

  const manifestPath = path.join(mipRoot, 'manifest.json')
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`Generated mip pyramid: ${levels.length} levels`)
  for (const level of levels) {
    console.log(`L${level.level}: ${level.count} tiles, worldSize=${level.worldSize}`)
  }
  console.log(`Manifest: ${manifestPath}`)
  console.log(`MIP elapsed: ${elapsedSec}s`)
  console.log(`MIP memory: ${usageText()}`)
  console.log(`MIP peak memory: rss=${formatBytes(peakRss)}, heap=${formatBytes(peakHeap)}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
