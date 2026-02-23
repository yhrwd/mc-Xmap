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

function getArgs() {
  const args = process.argv.slice(2)
  return {
    sourceDir: path.resolve(args[0] || path.join(process.cwd(), 'map')),
    outDir: path.resolve(args[1] || path.join(process.cwd(), 'public', 'tiles')),
    quality: Math.max(1, Math.min(100, Number(args[2] || 90))),
    concurrency: Math.max(1, Number(args[3] || 8)),
  }
}

async function runPool(items, worker, limit) {
  let cursor = 0
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      await worker(items[i], i)
    }
  })
  await Promise.all(workers)
}

async function main() {
  const { sourceDir, outDir, quality, concurrency } = getArgs()
  if (!fs.existsSync(sourceDir)) {
    console.error(`Error: source directory not found: ${sourceDir}`)
    process.exit(1)
  }

  ensureDir(outDir)

  const sourceFiles = fs
    .readdirSync(sourceDir)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort()

  const tasks = []
  const expectedWebp = new Set()

  for (const filename of sourceFiles) {
    const parsed = parseTileName(filename)
    if (!parsed) continue
    const outName = `${parsed.col}_${parsed.row}_x${parsed.x}_z${parsed.z}.webp`
    expectedWebp.add(outName)

    const srcPath = path.join(sourceDir, filename)
    const outPath = path.join(outDir, outName)

    const srcStat = fs.statSync(srcPath)
    const outStat = fs.existsSync(outPath) ? fs.statSync(outPath) : null
    const needsBuild = !outStat || srcStat.mtimeMs > outStat.mtimeMs
    tasks.push({ filename, srcPath, outPath, outName, ...parsed, needsBuild })
  }

  let converted = 0
  let skipped = 0
  const toBuild = tasks.filter((t) => t.needsBuild)
  skipped = tasks.length - toBuild.length

  await runPool(
    toBuild,
    async (t) => {
      await sharp(t.srcPath).webp({ quality, effort: 4 }).toFile(t.outPath)
      converted++
    },
    concurrency,
  )

  // remove stale webp tiles
  for (const file of fs.readdirSync(outDir)) {
    if (!file.endsWith('.webp')) continue
    if (file === 'overview.webp') continue
    if (!expectedWebp.has(file)) {
      fs.unlinkSync(path.join(outDir, file))
    }
  }

  const builtTiles = tasks
    .map((t) => ({
      col: t.col,
      row: t.row,
      x: t.x,
      z: t.z,
      filename: t.outName,
      path: `./${t.outName}`,
    }))
    .sort((a, b) => (a.x === b.x ? a.z - b.z : a.x - b.x))

  const minX = builtTiles.length > 0 ? Math.min(...builtTiles.map((t) => t.x)) : 0
  const maxX = builtTiles.length > 0 ? Math.max(...builtTiles.map((t) => t.x)) : 0
  const minZ = builtTiles.length > 0 ? Math.min(...builtTiles.map((t) => t.z)) : 0
  const maxZ = builtTiles.length > 0 ? Math.max(...builtTiles.map((t) => t.z)) : 0

  fs.writeFileSync(
    path.join(outDir, 'tile-index.json'),
    JSON.stringify({ tiles: builtTiles, minX, maxX, minZ, maxZ }, null, 2),
  )

  // build mip pyramid
  const mipCmd = spawnSync(
    process.execPath,
    [path.join(process.cwd(), 'scripts', 'generate-mip-pyramid.cjs'), outDir, '8'],
    { stdio: 'inherit' },
  )
  if (mipCmd.status !== 0) {
    console.error('Error: mip generation failed')
    process.exit(1)
  }

  console.log(`Done. total=${tasks.length}, converted=${converted}, skipped=${skipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
