#!/usr/bin/env node

const path = require('path')
const { spawnSync } = require('child_process')

function parseArgInt(name, value, fallback) {
  if (value === undefined) return fallback
  const n = Number.parseInt(value, 10)
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(`${name} must be an integer >= 1, got: ${value}`)
  }
  return n
}

function printUsage() {
  console.log(`Usage:
  node scripts/pipeline-map.cjs [mapRoot] [mergedDir] [tilesDir] [quality] [processConcurrency] [mergeWorkers] [mipLevels]

Defaults:
  mapRoot            ./map
  mergedDir          ./map/merged_map
  tilesDir           ./public/tiles
  quality            90
  processConcurrency 8
  mergeWorkers       4
  mipLevels          8`)
}

function getArgs() {
  const args = process.argv.slice(2)
  if (args.includes('-h') || args.includes('--help')) {
    return { help: true }
  }
  const mapRoot = path.resolve(args[0] || path.join(process.cwd(), 'map'))
  const mergedDir = path.resolve(args[1] || path.join(mapRoot, 'merged_map'))
  const tilesDir = path.resolve(args[2] || path.join(process.cwd(), 'public', 'tiles'))
  const quality = parseArgInt('quality', args[3], 90)
  const processConcurrency = parseArgInt('processConcurrency', args[4], 8)
  const mergeWorkers = parseArgInt('mergeWorkers', args[5], 4)
  const mipLevels = parseArgInt('mipLevels', args[6], 8)
  return { help: false, mapRoot, mergedDir, tilesDir, quality, processConcurrency, mergeWorkers, mipLevels }
}

function runStep(label, cmd, cmdArgs) {
  console.log(`\n== ${label} ==`)
  console.log(`${cmd} ${cmdArgs.join(' ')}`)
  const result = spawnSync(cmd, cmdArgs, { stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

function main() {
  const { help, mapRoot, mergedDir, tilesDir, quality, processConcurrency, mergeWorkers, mipLevels } =
    getArgs()
  if (help) {
    printUsage()
    return
  }
  const scriptsDir = __dirname

  runStep('Merge map layers', process.execPath, [
    path.join(scriptsDir, 'merge-map.cjs'),
    '--base-path',
    mapRoot,
    '--output-dir',
    mergedDir,
    '--workers',
    String(mergeWorkers),
  ])

  runStep('Process merged map', process.execPath, [
    path.join(scriptsDir, 'process-map.cjs'),
    mergedDir,
    tilesDir,
    String(quality),
    String(processConcurrency),
    String(mipLevels),
  ])

  console.log('\nPipeline completed successfully.')
}

try {
  main()
} catch (err) {
  console.error(err && err.stack ? err.stack : String(err))
  process.exit(1)
}
