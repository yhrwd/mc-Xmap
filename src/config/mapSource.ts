type SourceMode = 'local' | 'remote'

interface RemoteSourceConfig {
  tileIndexUrl: string
  markersUrl: string
  tileBaseUrl: string
  mipManifestUrl: string
}

interface MapSourceConfig {
  mode: SourceMode
  remote: RemoteSourceConfig
}

export const mapSourceConfig: MapSourceConfig = {
  // 默认本地加载；改成 'remote' 可切换到远程资源
  mode: 'local',
  remote: {
    tileIndexUrl: 'https://example.com/tiles/tile-index.json',
    markersUrl: 'https://example.com/markers.json',
    tileBaseUrl: 'https://example.com/tiles/',
    mipManifestUrl: 'https://example.com/tiles/mip/manifest.json',
  },
}

function isAbsoluteUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')
}

function trimLeadingDotSlash(value: string): string {
  return value.startsWith('./') ? value.slice(2) : value
}

export function getTileIndexUrl(): string {
  return mapSourceConfig.mode === 'remote'
    ? mapSourceConfig.remote.tileIndexUrl
    : './tiles/tile-index.json'
}

export function getMarkersUrl(): string {
  return mapSourceConfig.mode === 'remote' ? mapSourceConfig.remote.markersUrl : './markers.json'
}

export function getMipManifestUrl(): string {
  return mapSourceConfig.mode === 'remote'
    ? mapSourceConfig.remote.mipManifestUrl
    : './tiles/mip/manifest.json'
}

export function resolveTileResource(pathOrFilename: string): string {
  if (!pathOrFilename) return ''
  if (isAbsoluteUrl(pathOrFilename)) return pathOrFilename

  const normalized = trimLeadingDotSlash(pathOrFilename)
  if (mapSourceConfig.mode === 'remote') {
    return new URL(normalized, mapSourceConfig.remote.tileBaseUrl).toString()
  }

  // 本地模式：允许 /tiles/... 或 tiles/... 或 filename.webp
  if (normalized.startsWith('/')) return normalized
  if (normalized.startsWith('tiles/')) return `/${normalized}`
  return `/tiles/${normalized}`
}
