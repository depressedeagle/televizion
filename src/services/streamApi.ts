/**
 * Клиентский API для извлечения прямых HLS-потоков (.m3u8)
 * и проксирования через бэкенд для обхода CORS.
 */

import { authService } from './authService'

export interface StreamSeasonInfo {
  season: number
  episodesCount: number
  episodes: {
    episode: string
    hasHls: boolean
    audioTracks: string[]
  }[]
}

export interface StreamExtractResult {
  success: boolean
  isSeries?: boolean
  title?: string
  hls?: string
  audioTracks?: string[]
  subtitles?: Array<{ url: string; label: string }>
  currentSeason?: number
  currentEpisode?: string
  seasons?: StreamSeasonInfo[]
  error?: string
  fallbackIframe?: string
}

/**
 * Извлечь прямой HLS-поток для фильма или серии
 */
export async function extractStream(params: {
  kinopoiskId?: string
  imdbId?: string
  title?: string
  season?: number
  episode?: number
}): Promise<StreamExtractResult> {
  const url = new URL('/api/stream/extract', authService.getApiBase())
  if (params.kinopoiskId) url.searchParams.set('kinopoiskId', params.kinopoiskId)
  if (params.imdbId) url.searchParams.set('imdbId', params.imdbId)
  if (params.title) url.searchParams.set('title', params.title)
  if (params.season) url.searchParams.set('season', String(params.season))
  if (params.episode) url.searchParams.set('episode', String(params.episode))

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })

  if (!res.ok) {
    return { success: false, error: `HTTP ${res.status}` }
  }

  return (await res.json()) as StreamExtractResult
}

/**
 * Преобразовать прямой HLS URL в проксированный URL через бэкенд.
 * Это нужно для обхода CORS-ограничений CDN при воспроизведении через hls.js.
 */
export function getProxiedHlsUrl(hlsUrl: string, audioTracks?: string[]): string {
  if (!hlsUrl) return ''
  const apiBase = authService.getApiBase()
  let result = `${apiBase}/api/hls-proxy?url=${encodeURIComponent(hlsUrl)}`
  if (audioTracks && audioTracks.length > 0) {
    result += `&audioTracks=${encodeURIComponent(audioTracks.join('|||'))}`
  }
  return result
}
