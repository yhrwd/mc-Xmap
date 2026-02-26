#!/usr/bin/env node
'use strict'

const fs = require('node:fs/promises')
const path = require('node:path')

const sharp = require('sharp')

const IMAGE_SUFFIXES = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tif', '.tiff', '.webp'])
const MAP_FOLDER_RE = /^map(\d+)$/i
const COORD_RE = /x(-?\d+)_z(-?\d+)/

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = Number(bytes)
  let idx = 0
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024
    idx += 1
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)}${units[idx]}`
}

function getMemoryUsage() {
  const m = process.memoryUsage()
  return {
    rss: m.rss,
    heapUsed: m.heapUsed,
  }
}

function printUsage() {
  console.log(`用法:
  node scripts/merge-map.cjs [选项]

选项:
  --base-path <path>    包含 map* 目录的路径，默认 "./map"
  --output-dir <path>   输出目录，默认 "./map/merged_map"
  --prefix <name>       输出文件名前缀，默认 "chunk"
  --tile-size <n>       瓦片大小，默认 1024
  --base-x <n>          自动生成 chunk 的基准 x，默认 -512
  --base-z <n>          自动生成 chunk 的基准 z，默认 0
  --save-empty          保存全黑 chunk（默认跳过）
  --limit <n>           仅处理前 N 个 chunk（0 表示不限制）
  --workers <n>         并行 worker 数，1 为串行（默认 1）
  -h, --help            显示帮助`)
}

function parseIntArg(name, value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} 需要整数，收到: ${value}`)
  }
  return parsed
}

function parseArgs(argv) {
  const args = {
    basePath: 'map',
    outputDir: path.join('map', 'merged_map'),
    prefix: 'chunk',
    tileSize: 1024,
    baseX: -512,
    baseZ: 0,
    saveEmpty: false,
    limit: 0,
    workers: 1,
    help: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '-h' || arg === '--help') {
      args.help = true
      continue
    }
    if (arg === '--save-empty') {
      args.saveEmpty = true
      continue
    }

    const next = argv[i + 1]
    if (next === undefined) {
      throw new Error(`${arg} 缺少参数值`)
    }

    switch (arg) {
      case '--base-path':
        args.basePath = next
        i += 1
        break
      case '--output-dir':
        args.outputDir = next
        i += 1
        break
      case '--prefix':
        args.prefix = next
        i += 1
        break
      case '--tile-size':
        args.tileSize = parseIntArg('--tile-size', next)
        i += 1
        break
      case '--base-x':
        args.baseX = parseIntArg('--base-x', next)
        i += 1
        break
      case '--base-z':
        args.baseZ = parseIntArg('--base-z', next)
        i += 1
        break
      case '--limit':
        args.limit = parseIntArg('--limit', next)
        i += 1
        break
      case '--workers':
        args.workers = parseIntArg('--workers', next)
        i += 1
        break
      default:
        throw new Error(`未知参数: ${arg}`)
    }
  }

  return args
}

function folderSortKey(folderName) {
  const match = MAP_FOLDER_RE.exec(folderName)
  if (match) {
    // return [0, Number.parseInt(match[1], 10), folderName.toLowerCase()];
    return [0, -Number.parseInt(match[1], 10), folderName.toLowerCase()]
  }
  return [1, 0, folderName.toLowerCase()]
}

function compareFolderName(a, b) {
  const ka = folderSortKey(a)
  const kb = folderSortKey(b)
  if (ka[0] !== kb[0]) return ka[0] - kb[0]
  if (ka[1] !== kb[1]) return ka[1] - kb[1]
  if (ka[2] < kb[2]) return -1
  if (ka[2] > kb[2]) return 1
  return 0
}

async function pathIsDirectory(target) {
  try {
    const st = await fs.stat(target)
    return st.isDirectory()
  } catch {
    return false
  }
}

async function pathIsFile(target) {
  try {
    const st = await fs.stat(target)
    return st.isFile()
  } catch {
    return false
  }
}

async function getFolders(basePath) {
  const baseDir = path.resolve(basePath)
  let st
  try {
    st = await fs.stat(baseDir)
  } catch {
    console.error(`[error]: 路径 ${baseDir} 不存在`)
    return []
  }

  if (!st.isDirectory()) {
    console.error(`[error]: 路径 ${baseDir} 不是目录`)
    return []
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true })
  const subdirs = entries
    .filter(
      (ent) =>
        ent.isDirectory() && !ent.name.startsWith('.') && ent.name.toLowerCase().startsWith('map'),
    )
    .map((ent) => ent.name)
    .sort(compareFolderName)
    .map((name) => path.resolve(baseDir, name))

  if (subdirs.length === 0) {
    console.log(`提示: 在 ${baseDir} 下未找到 map* 目录`)
  } else {
    const names = subdirs.map((dirPath) => path.basename(dirPath))
    console.log(
      `成功找到 ${subdirs.length} 个 map 目录（覆盖顺序从前到后）: ${JSON.stringify(names)}`,
    )
  }

  return subdirs
}

async function getFiles(folderPath) {
  const absFolder = path.resolve(folderPath)
  if (!(await pathIsDirectory(absFolder))) {
    console.error(`[error]: ${absFolder} 不是有效目录，跳过文件扫描`)
    return []
  }

  const entries = await fs.readdir(absFolder, { withFileTypes: true })
  const files = entries
    .filter((ent) => ent.isFile() && !ent.name.startsWith('.'))
    .filter((ent) => IMAGE_SUFFIXES.has(path.extname(ent.name).toLowerCase()))
    .map((ent) => path.resolve(absFolder, ent.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)))

  return files
}

async function getImgXZ(filePath) {
  const absPath = path.resolve(filePath)
  if (!(await pathIsFile(absPath))) {
    console.error(`[error]: ${absPath} 不是文件，无法提取坐标`)
    return [null, null]
  }

  const stem = path.parse(absPath).name
  const match = COORD_RE.exec(stem)
  if (!match) {
    console.error(
      `[error]: 无法从 ${path.basename(absPath)} 中匹配 x/z 坐标（格式要求: ..._x数字_z数字）`,
    )
    return [null, null]
  }

  const x = Number.parseInt(match[1], 10)
  const z = Number.parseInt(match[2], 10)
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    console.error(`[error]: 从 ${absPath} 中匹配的坐标不是有效数字`)
    return [null, null]
  }

  return [x, z]
}

function alignToChunk(val, base, chunkSize, direction = 'down') {
  const offset = val - base
  if (direction === 'down') {
    return base + Math.floor(offset / chunkSize) * chunkSize
  }
  return base + Math.ceil(offset / chunkSize) * chunkSize
}

function createGrid(x0, z0, x1, z1, chunkSize = 1024, baseX = -512, baseZ = 0) {
  const alignedX0 = alignToChunk(x0, baseX, chunkSize, 'down')
  const alignedZ0 = alignToChunk(z0, baseZ, chunkSize, 'down')
  const alignedX1 = alignToChunk(x1, baseX, chunkSize, 'up') + chunkSize - 1
  const alignedZ1 = alignToChunk(z1, baseZ, chunkSize, 'up') + chunkSize - 1

  const startGx = Math.floor((alignedX0 - baseX) / chunkSize)
  const endGx = Math.floor((alignedX1 - baseX) / chunkSize)
  const startGz = Math.floor((alignedZ0 - baseZ) / chunkSize)
  const endGz = Math.floor((alignedZ1 - baseZ) / chunkSize)

  const chunks = []
  for (let gz = startGz; gz <= endGz; gz += 1) {
    for (let gx = startGx; gx <= endGx; gx += 1) {
      chunks.push({
        gx: Number(gx),
        gz: Number(gz),
        vx: Number(baseX + gx * chunkSize),
        vz: Number(baseZ + gz * chunkSize),
      })
    }
  }

  return {
    chunks,
    mapBound: [alignedX0, alignedZ0, alignedX1, alignedZ1],
  }
}

class TileRef {
  constructor(filePath, x0, z0, tileSize) {
    this.filePath = filePath
    this.x0 = x0
    this.z0 = z0
    this.x1 = x0 + tileSize - 1
    this.z1 = z0 + tileSize - 1
  }
}

class TileRTreeIndex {
  constructor(tileSize = 1024) {
    this.tileSize = tileSize
    this.tiles = []
  }

  addTile(x0, z0, filePath) {
    try {
      this.tiles.push(new TileRef(filePath, x0, z0, this.tileSize))
    } catch (exc) {
      console.error(`[error]: 添加瓦片 ${filePath} 到索引失败 - ${String(exc)}`)
    }
  }

  findByCoordinate(targetX, targetZ) {
    try {
      for (const tile of this.tiles) {
        if (targetX >= tile.x0 && targetX <= tile.x1 && targetZ >= tile.z0 && targetZ <= tile.z1) {
          return tile.filePath
        }
      }
    } catch (exc) {
      console.error(`[error]: 坐标查询失败 - ${String(exc)}`)
    }
    return null
  }

  findByArea(areaX0, areaZ0, areaX1, areaZ1) {
    try {
      const minX = Math.min(areaX0, areaX1)
      const maxX = Math.max(areaX0, areaX1)
      const minZ = Math.min(areaZ0, areaZ1)
      const maxZ = Math.max(areaZ0, areaZ1)

      const hits = []
      for (const tile of this.tiles) {
        if (tile.x1 < minX || tile.x0 > maxX || tile.z1 < minZ || tile.z0 > maxZ) {
          continue
        }
        hits.push(tile)
      }
      return hits
    } catch (exc) {
      console.error(`[error]: 区域查询失败 - ${String(exc)}`)
      return []
    }
  }

  getBounds() {
    if (this.tiles.length === 0) {
      return null
    }
    let minX = this.tiles[0].x0
    let minZ = this.tiles[0].z0
    let maxX = this.tiles[0].x1
    let maxZ = this.tiles[0].z1
    for (const tile of this.tiles) {
      if (tile.x0 < minX) minX = tile.x0
      if (tile.z0 < minZ) minZ = tile.z0
      if (tile.x1 > maxX) maxX = tile.x1
      if (tile.z1 > maxZ) maxZ = tile.z1
    }
    return [minX, minZ, maxX, maxZ]
  }
}

class DirFIndex {
  constructor(tileSize = 1024) {
    this.tileSize = tileSize
    this.indexes = new Map()
  }

  async loadFolders(folders) {
    for (const folder of folders) {
      // 保持与 Python 版一致：按目录顺序串行加载。
      await this.loadFolder(folder)
    }
  }

  async loadFolder(folder) {
    const idx = new TileRTreeIndex(this.tileSize)
    const files = await getFiles(folder)
    if (files.length === 0) {
      console.error(`[warn]: ${path.basename(folder)} 无有效图片文件，跳过`)
      return
    }

    let valid = 0
    for (const filePath of files) {
      const [x, z] = await getImgXZ(filePath)
      if (x === null || z === null) {
        console.log(`  [skip] 跳过文件: ${path.basename(filePath)} (坐标解析失败)`)
        continue
      }
      idx.addTile(x, z, filePath)
      valid += 1
    }

    if (valid > 0) {
      this.indexes.set(folder, idx)
      console.log(`[ok] ${path.basename(folder)}: 加载 ${valid} 张瓦片`)
    } else {
      console.error(`[warn] ${path.basename(folder)}: 没有可用瓦片`)
    }
  }

  normalizeFolders(folders) {
    if (!folders) {
      return Array.from(this.indexes.keys())
    }
    return Array.isArray(folders) ? folders : [folders]
  }

  queryCoord(x, z, folders = null) {
    const targetFolders = this.normalizeFolders(folders)
    const results = new Map()
    for (const folder of targetFolders) {
      const idx = this.indexes.get(folder)
      if (!idx) {
        console.error(`[warn] ${path.basename(folder)} 未加载索引`)
        results.set(folder, null)
        continue
      }
      results.set(folder, idx.findByCoordinate(x, z))
    }
    return results
  }

  queryArea(x0, z0, x1, z1, folders = null) {
    const targetFolders = this.normalizeFolders(folders)
    const minX = Math.min(x0, x1)
    const maxX = Math.max(x0, x1)
    const minZ = Math.min(z0, z1)
    const maxZ = Math.max(z0, z1)
    const results = new Map()

    for (const folder of targetFolders) {
      const idx = this.indexes.get(folder)
      if (!idx) {
        console.error(`[warn] ${path.basename(folder)} 未加载索引`)
        results.set(folder, [])
        continue
      }
      results.set(folder, idx.findByArea(minX, minZ, maxX, maxZ))
    }

    return results
  }

  queryBounds(folders = null) {
    const targetFolders = this.normalizeFolders(folders)
    const results = new Map()
    for (const folder of targetFolders) {
      const idx = this.indexes.get(folder)
      if (!idx) {
        console.error(`[warn] ${path.basename(folder)} 未加载索引`)
        results.set(folder, null)
        continue
      }
      results.set(folder, idx.getBounds())
    }
    return results
  }
}

function rectIntersection(ax0, az0, ax1, az1, bx0, bz0, bx1, bz1) {
  const ix0 = Math.max(ax0, bx0)
  const iz0 = Math.max(az0, bz0)
  const ix1 = Math.min(ax1, bx1)
  const iz1 = Math.min(az1, bz1)
  if (ix0 > ix1 || iz0 > iz1) {
    return null
  }
  return [ix0, iz0, ix1, iz1]
}

function normalizeRawToRgb(data, channels, width, height) {
  if (channels === 3) {
    return data
  }

  const pixelCount = width * height
  const out = Buffer.allocUnsafe(pixelCount * 3)
  if (channels === 1) {
    for (let i = 0; i < pixelCount; i += 1) {
      const v = data[i]
      const di = i * 3
      out[di] = v
      out[di + 1] = v
      out[di + 2] = v
    }
    return out
  }

  if (channels === 2) {
    for (let i = 0; i < pixelCount; i += 1) {
      const v = data[i * 2]
      const di = i * 3
      out[di] = v
      out[di + 1] = v
      out[di + 2] = v
    }
    return out
  }

  if (channels === 4) {
    for (let i = 0; i < pixelCount; i += 1) {
      const si = i * 4
      const di = i * 3
      out[di] = data[si]
      out[di + 1] = data[si + 1]
      out[di + 2] = data[si + 2]
    }
    return out
  }

  throw new Error(`不支持的通道数: ${channels}`)
}

class TileCache {
  constructor(maxSize = 256) {
    this.maxSize = maxSize
    this.cache = new Map()
  }

  async loadRgbTile(tilePath, tileSize) {
    const key = `${tileSize}|${tilePath}`
    if (this.cache.has(key)) {
      const value = this.cache.get(key)
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }

    const promise = this.readRgbTile(tilePath, tileSize).catch((err) => {
      this.cache.delete(key)
      throw err
    })

    this.cache.set(key, promise)
    while (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }

    return promise
  }

  async readRgbTile(tilePath, tileSize) {
    const { data, info } = await sharp(tilePath)
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      // libvips/sharp 使用 "srgb"，不是 "rgb"。
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true })

    if (info.width !== tileSize || info.height !== tileSize) {
      throw new Error(
        `图片尺寸错误: ${tilePath}，期望 ${tileSize}x${tileSize}，实际 ${info.width}x${info.height}`,
      )
    }

    return normalizeRawToRgb(data, info.channels, info.width, info.height)
  }
}

async function mergeSingleChunk(chunk, folderIndexer, folderOrder, tileSize, tileCache) {
  const chunkX0 = Number(chunk.vx)
  const chunkZ0 = Number(chunk.vz)
  const chunkX1 = chunkX0 + tileSize - 1
  const chunkZ1 = chunkZ0 + tileSize - 1

  const canvas = Buffer.alloc(tileSize * tileSize * 3, 0)
  let wroteAny = false
  let touchedTiles = 0

  const areaTiles = folderIndexer.queryArea(chunkX0, chunkZ0, chunkX1, chunkZ1, folderOrder)
  for (const folder of folderOrder) {
    const tiles = areaTiles.get(folder) || []
    if (tiles.length === 0) {
      continue
    }

    for (const tileRef of tiles) {
      const inter = rectIntersection(
        chunkX0,
        chunkZ0,
        chunkX1,
        chunkZ1,
        tileRef.x0,
        tileRef.z0,
        tileRef.x1,
        tileRef.z1,
      )
      if (!inter) {
        continue
      }

      const [ix0, iz0, ix1, iz1] = inter
      const srcX0 = ix0 - tileRef.x0
      const srcY0 = iz0 - tileRef.z0
      const srcX1 = ix1 - tileRef.x0 + 1
      const srcY1 = iz1 - tileRef.z0 + 1
      const dstX0 = ix0 - chunkX0
      const dstY0 = iz0 - chunkZ0
      const dstX1 = ix1 - chunkX0 + 1
      const dstY1 = iz1 - chunkZ0 + 1

      const srcImg = await tileCache.loadRgbTile(tileRef.filePath, tileSize)
      const width = srcX1 - srcX0
      const height = srcY1 - srcY0

      let wroteThisTile = false
      for (let y = 0; y < height; y += 1) {
        const srcRowBase = ((srcY0 + y) * tileSize + srcX0) * 3
        const dstRowBase = ((dstY0 + y) * tileSize + dstX0) * 3
        for (let x = 0; x < width; x += 1) {
          const srcIdx = srcRowBase + x * 3
          const r = srcImg[srcIdx]
          const g = srcImg[srcIdx + 1]
          const b = srcImg[srcIdx + 2]
          if (r === 0 && g === 0 && b === 0) {
            continue
          }
          const dstIdx = dstRowBase + x * 3
          canvas[dstIdx] = r
          canvas[dstIdx + 1] = g
          canvas[dstIdx + 2] = b
          wroteAny = true
          wroteThisTile = true
        }
      }

      if (wroteThisTile) {
        touchedTiles += 1
      }
    }
  }

  return [canvas, wroteAny, touchedTiles]
}

function getChunks(folderIndexer, folderOrder, tileSize, baseX, baseZ) {
  const boundsResults = folderIndexer.queryBounds(folderOrder)
  const allX = []
  const allZ = []

  for (const folder of folderOrder) {
    const bounds = boundsResults.get(folder)
    if (!bounds) {
      console.log(`  [info] ${path.basename(folder)}: 无法获取边界`)
      continue
    }
    const [x0, z0, x1, z1] = bounds
    allX.push(x0, x1)
    allZ.push(z0, z1)
  }

  if (allX.length === 0 || allZ.length === 0) {
    return []
  }

  const { chunks, mapBound } = createGrid(
    Math.min(...allX),
    Math.min(...allZ),
    Math.max(...allX),
    Math.max(...allZ),
    tileSize,
    baseX,
    baseZ,
  )

  console.log(`按索引自动生成 chunks: ${chunks.length}`)
  console.log(`对齐后边界: (${mapBound[0]}, ${mapBound[1]}) -> (${mapBound[2]}, ${mapBound[3]})`)
  return chunks
}

function buildChunkFilename(chunk, prefix) {
  const vx = Number(chunk.vx)
  const vz = Number(chunk.vz)
  if (Object.hasOwn(chunk, 'gx') && Object.hasOwn(chunk, 'gz')) {
    const gx = Number(chunk.gx)
    const gz = Number(chunk.gz)
    return `${prefix}_${gx}_${gz}_x${vx}_z${vz}.png`
  }
  return `${prefix}_x${vx}_z${vz}.png`
}

async function processAndSaveChunk(
  chunk,
  folderIndexer,
  folderOrder,
  tileSize,
  saveEmpty,
  outputDir,
  prefix,
  tileCache,
) {
  const [mergedImg, wroteAny, touchedTiles] = await mergeSingleChunk(
    chunk,
    folderIndexer,
    folderOrder,
    tileSize,
    tileCache,
  )

  if (!wroteAny && !saveEmpty) {
    return [false, 0]
  }

  const outName = buildChunkFilename(chunk, prefix)
  const outPath = path.resolve(outputDir, outName)
  await sharp(mergedImg, {
    raw: { width: tileSize, height: tileSize, channels: 3 },
  })
    .png()
    .toFile(outPath)

  return [true, touchedTiles]
}

async function clearOutputDir(outputDir, basePath) {
  const resolvedOut = path.resolve(outputDir)
  const resolvedBase = path.resolve(basePath)
  if (resolvedOut === resolvedBase) {
    throw new Error(`输出目录不能与数据目录相同: ${resolvedOut}`)
  }

  if (resolvedOut === path.parse(resolvedOut).root) {
    throw new Error(`拒绝清空磁盘根目录: ${resolvedOut}`)
  }

  let st = null
  try {
    st = await fs.stat(resolvedOut)
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      await fs.mkdir(resolvedOut, { recursive: true })
      return
    }
    throw err
  }

  if (!st.isDirectory()) {
    throw new Error(`输出路径不是目录: ${resolvedOut}`)
  }

  const children = await fs.readdir(resolvedOut, { withFileTypes: true })
  for (const child of children) {
    const childPath = path.resolve(resolvedOut, child.name)
    await fs.rm(childPath, { recursive: true, force: true })
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return 0
  }

  const basePath = path.resolve(args.basePath)
  const outputDir = path.resolve(args.outputDir)
  const workers = Number(args.workers)
  if (workers < 1) {
    console.error('[error]: --workers 必须 >= 1')
    return 1
  }

  console.log('开始加载 map 索引...')
  const mapFolders = await getFolders(basePath)
  if (mapFolders.length === 0) {
    console.error('[error]: 没有可用 map 目录')
    return 1
  }

  const folderIndexer = new DirFIndex(args.tileSize)
  await folderIndexer.loadFolders(mapFolders)
  const folderOrder = mapFolders.filter((f) => folderIndexer.indexes.has(f))
  if (folderOrder.length === 0) {
    console.error('[error]: 没有加载到任何可用瓦片')
    return 1
  }

  console.log(`有效覆盖顺序: ${JSON.stringify(folderOrder.map((f) => path.basename(f)))}`)
  let chunks = getChunks(folderIndexer, folderOrder, args.tileSize, args.baseX, args.baseZ)
  if (chunks.length === 0) {
    console.log('[warn]: chunk 列表为空，无需处理')
    return 0
  }

  if (args.limit > 0) {
    chunks = chunks.slice(0, args.limit)
    console.log(`调试限制: 仅处理前 ${chunks.length} 个 chunk`)
  }

  try {
    await clearOutputDir(outputDir, basePath)
  } catch (exc) {
    console.error(`[error]: 清空输出目录失败 - ${String(exc.message || exc)}`)
    return 1
  }

  console.log(`输出目录(已清空): ${outputDir}`)
  console.log(`处理模式: ${workers === 1 ? '串行' : `多线程(${workers})`}`)

  const tileCache = new TileCache(256)
  const total = chunks.length
  let saved = 0
  let skipped = 0
  let usedTileRefs = 0
  let peakRss = 0
  let peakHeapUsed = 0

  const usageText = () => {
    const mem = getMemoryUsage()
    if (mem.rss > peakRss) peakRss = mem.rss
    if (mem.heapUsed > peakHeapUsed) peakHeapUsed = mem.heapUsed
    return `rss=${formatBytes(mem.rss)}, heap=${formatBytes(mem.heapUsed)}, cache=${tileCache.cache.size}/${tileCache.maxSize}`
  }

  const processOne = async (chunk) =>
    processAndSaveChunk(
      chunk,
      folderIndexer,
      folderOrder,
      args.tileSize,
      args.saveEmpty,
      outputDir,
      args.prefix,
      tileCache,
    )

  if (workers === 1) {
    for (let i = 0; i < chunks.length; i += 1) {
      const [didSave, touchedTiles] = await processOne(chunks[i])
      if (didSave) {
        saved += 1
        usedTileRefs += touchedTiles
      } else {
        skipped += 1
      }
      const done = i + 1
      if (done % 200 === 0 || done === total) {
        console.log(`[${done}/${total}] saved=${saved}, skipped=${skipped}`)
      }
    }
  } else {
    let nextIndex = 0
    let completed = 0
    const runnerCount = Math.min(workers, total)
    const runners = Array.from({ length: runnerCount }, async () => {
      for (;;) {
        const idx = nextIndex
        nextIndex += 1
        if (idx >= total) {
          break
        }

        const [didSave, touchedTiles] = await processOne(chunks[idx])
        if (didSave) {
          saved += 1
          usedTileRefs += touchedTiles
        } else {
          skipped += 1
        }
        completed += 1

        if (completed % 200 === 0 || completed === total) {
          console.log(`[${completed}/${total}] saved=${saved}, skipped=${skipped}`)
        }
      }
    })

    await Promise.all(runners)
  }

  console.log('\n处理完成')
  console.log(`总 chunks: ${total}`)
  console.log(`已保存: ${saved}`)
  console.log(`已跳过(全黑): ${skipped}`)
  console.log(`参与覆盖的瓦片引用数: ${usedTileRefs}`)
  console.log(`当前占用: ${usageText()}`)
  console.log(`峰值占用: rss=${formatBytes(peakRss)}, heap=${formatBytes(peakHeapUsed)}`)
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err) => {
    console.error(`[fatal]: ${err && err.stack ? err.stack : String(err)}`)
    process.exitCode = 1
  })
