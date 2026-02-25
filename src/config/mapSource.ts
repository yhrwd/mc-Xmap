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

// 自动检测并加载所有 markers 文件夹下的 JSON 文件
export async function getMarkersPartUrls(): Promise<string[]> {
  if (mapSourceConfig.mode === 'remote') {
    // 远程模式：需要手动提供
    return [mapSourceConfig.remote.markersUrl]
  }

  // 本地模式：扫描 public/markers 目录下所有 JSON 文件
  const urls: string[] = []
  try {
    // 尝试获取 markers 目录列表（通过尝试加载）
    // 由于浏览器安全限制，我们无法直接列出目录，所以尝试常见文件名
    // 先尝试加载 markers.json（旧格式）
    let foundAny = false

    // 尝试各种可能的 markers 文件名
    const possibleFiles = [
      './markers/markers_0.json',
      './markers/markers_1.json',
      './markers/markers_2.json',
      './markers/markers_3.json',
      './markers/markers_4.json',
      './markers/markers_5.json',
      './markers/markers_6.json',
      './markers/markers_7.json',
      './markers/markers_8.json',
      './markers/markers_9.json',
      './markers/markers_10.json',
      './markers/markers_1_RX.json',
      './markers/markers_2_other.json',
      './markers/markers_creaking_village.json',
      './markers/markers_lonely_fortress.json',
      './markers/markers_photosynthesis_ruin.json',
      './markers/markers_power_trial.json',
      './markers/markers_sky_trial.json',
      './markers/markers_stoxic_cavern.json',
      './markers/markers_trident_trial.json',
      './markers/markers_wax_wing_ruin.json',
    ]

    for (const url of possibleFiles) {
      try {
        const response = await fetch(url, { method: 'HEAD', cache: 'no-store' })
        if (response.ok) {
          urls.push(url)
          foundAny = true
        }
      } catch {
        // 忽略错误，继续尝试下一个
      }
    }

    // 如果没有找到任何文件，回退到旧格式
    if (!foundAny) {
      urls.push('./markers.json')
    }
  } catch (error) {
    // 出错时使用旧格式
    urls.push('./markers.json')
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
