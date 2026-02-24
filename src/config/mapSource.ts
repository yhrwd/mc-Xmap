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

// 自动检测并加载所有 markers_*.json 文件
export async function getMarkersPartUrls(): Promise<string[]> {
  if (mapSourceConfig.mode === 'remote') {
    // 远程模式：需要手动提供
    return [mapSourceConfig.remote.markersUrl]
  }

  // 本地模式：自动扫描 public 目录下所有 markers_*.json 文件
  const urls: string[] = []
  try {
    // 尝试加载 markers_0.json, markers_1.json, ... 直到失败
    for (let i = 0; i < 100; i++) {
      const url = `./markers/markers_${i}.json`
      const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
      if (response.ok) {
        urls.push(url)
      } else if (i === 0) {
        // 如果第一个文件就不存在，回退到旧格式
        urls.push('./markers.json')
        break
      } else {
        break
      }
    }
  } catch (error) {
    // 出错时使用旧格式
    if (urls.length === 0) {
      urls.push('./markers.json')
    }
  }
  return urls
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
