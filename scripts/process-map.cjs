#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

let sharp
try {
  sharp = require('sharp')
} catch {
  console.error('Error: sharp is not installed. Run: npm install')
  process.exit(1)
}

const TILE_SIZE = 1024
const FILE_RE = /^.*?x(-?\d+)_z(-?\d+)\.png$/i

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

function parseTileName(filename) {
  const m = filename.match(FILE_RE)
  if (!m) return null
  const x = Number(m[1])
  const z = Number(m[2])
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null

  const col = Math.round((x - 512) / TILE_SIZE)
  const row = Math.round(z / TILE_SIZE)
  return { x, z, col, row }
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function clearDirSafe(dir, sourceDir) {
  const resolvedDir = path.resolve(dir)
  const resolvedSource = path.resolve(sourceDir)
  const root = path.parse(resolvedDir).root

  if (resolvedDir === root) {
    throw new Error(`Refuse to clear filesystem root: ${resolvedDir}`)
  }
  if (resolvedDir === resolvedSource) {
    throw new Error(`Output dir must not equal source dir: ${resolvedDir}`)
  }

  fs.rmSync(resolvedDir, { recursive: true, force: true })
  fs.mkdirSync(resolvedDir, { recursive: true })
}

function getArgs() {
  const args = process.argv.slice(2)
  return {
    sourceDir: path.resolve(args[0] || path.join(process.cwd(), 'map', 'merged_map')),
    outDir: path.resolve(args[1] || path.join(process.cwd(), 'public', 'tiles')),
    quality: Math.max(1, Math.min(100, Number(args[2] || 90))),
    concurrency: Math.max(1, Number(args[3] || 8)),
    mipLevels: Math.max(1, Number(args[4] || 8)),
  }
}

async function runPool(items, worker, limit) {
  let cursor = 0
  const workers = Array.from({ length: limit }, async () => {
    for (;;) {
      const i = cursor
      cursor += 1
      if (i >= items.length) break
      await worker(items[i], i)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const { sourceDir, outDir, quality, concurrency, mipLevels } = getArgs()
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: source directory not found: ${sourceDir}`)
    process.exit(1)
  }

  const sourceFiles = fs
    .readdirSync(sourceDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()

  const tasks = []
  for (const filename of sourceFiles) {
    const parsed = parseTileName(filename)
    if (!parsed) continue
    const outName = `${parsed.col}_${parsed.row}_x${parsed.x}_z${parsed.z}.webp`
    const srcPath = path.join(sourceDir, filename)
    const outPath = path.join(outDir, outName)
    tasks.push({ filename, srcPath, outPath, outName, ...parsed })
  }

  if (tasks.length === 0) {
    console.error(`Error: no valid png tiles found in ${sourceDir}`)
    process.exit(1)
  }

  clearDirSafe(outDir, sourceDir)
  ensureDir(outDir)

  console.log(`Source: ${sourceDir}`)
  console.log(`Output (cleared): ${outDir}`)
  console.log(`Tiles: ${tasks.length}, quality=${quality}, concurrency=${concurrency}`)

  let converted = 0
  let failed = 0
  let completed = 0
  let peakRss = 0
  let peakHeap = 0
  const builtTiles = []
  const startedAt = Date.now()

  const usageText = () => {
    const mem = process.memoryUsage()
    if (mem.rss > peakRss) peakRss = mem.rss
    if (mem.heapUsed > peakHeap) peakHeap = mem.heapUsed
    return `rss=${formatBytes(mem.rss)}, heap=${formatBytes(mem.heapUsed)}`
  }

  await runPool(
    tasks,
    async (task) => {
      try {
        await sharp(task.srcPath).webp({ quality, effort: 4 }).toFile(task.outPath)
        builtTiles.push({
          col: task.col,
          row: task.row,
          x: task.x,
          z: task.z,
          filename: task.outName,
          path: `./${task.outName}`,
        })
        converted += 1
      } catch (err) {
        failed += 1
        console.error(`Convert failed: ${task.filename} -> ${String(err && err.message ? err.message : err)}`)
      }

      completed += 1
      const done = completed
      if (done % 200 === 0 || done === tasks.length) {
        console.log(`[${done}/${tasks.length}] converted=${converted}, failed=${failed}, ${usageText()}`)
      }
    },
    concurrency,
  )

  builtTiles.sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x))
  const minX = builtTiles.length > 0 ? Math.min(...builtTiles.map((t) => t.x)) : 0
  const maxX = builtTiles.length > 0 ? Math.max(...builtTiles.map((t) => t.x)) : 0
  const minZ = builtTiles.length > 0 ? Math.min(...builtTiles.map((t) => t.z)) : 0
  const maxZ = builtTiles.length > 0 ? Math.max(...builtTiles.map((t) => t.z)) : 0

  fs.writeFileSync(
    path.join(outDir, 'tile-index.json'),
    JSON.stringify({ tiles: builtTiles, minX, maxX, minZ, maxZ }, null, 2),
  )

  const mipCmd = spawnSync(
    process.execPath,
    [path.join(__dirname, 'generate-mip-pyramid.cjs'), outDir, String(mipLevels)],
    { stdio: 'inherit' },
  )
  if (mipCmd.status !== 0) {
    console.error('Error: mip generation failed')
    process.exit(1)
  }

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`Done. total=${tasks.length}, converted=${converted}, failed=${failed}, elapsed=${elapsedSec}s`)
  console.log(`Current memory: ${usageText()}`)
  console.log(`Peak memory: rss=${formatBytes(peakRss)}, heap=${formatBytes(peakHeap)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
