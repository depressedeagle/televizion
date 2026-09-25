import { authService } from './authService'

export interface DirectEpisodeInfo {
  episode: string
  hasHls: boolean
  audioTracks?: string[]
}

export interface DirectSeasonInfo {
  season: number
  episodesCount: number
  episodes: DirectEpisodeInfo[]
}

export interface DirectStreamResponse {
  success: boolean
  isSeries?: boolean
  title?: string
  hls?: string
  audioTracks?: string[]
  subtitles?: Array<{ url: string; name: string }>
  currentSeason?: number
  currentEpisode?: string
  seasons?: DirectSeasonInfo[]
  error?: string
  fallbackIframe?: string
}

export async function fetchDirectStream(params: {
  kinopoiskId?: string
  imdbId?: string
  title?: string
  season?: number | string
  episode?: number | string
}): Promise<DirectStreamResponse> {
  const apiBase = authService.getApiBase()
  const url = new URL('/api/stream/extract', apiBase)

  if (params.kinopoiskId) url.searchParams.set('kinopoiskId', params.kinopoiskId)
  if (params.imdbId) url.searchParams.set('imdbId', params.imdbId)
  if (params.title) url.searchParams.set('title', params.title)
  if (params.season) url.searchParams.set('season', String(params.season))
  if (params.episode) url.searchParams.set('episode', String(params.episode))

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`)
    }

    const data = (await res.json()) as DirectStreamResponse
    return data
  } catch (err: any) {
    console.warn('[StreamService] Failed to fetch direct stream:', err?.message)
    return {
      success: false,
      error: err?.message || 'Не удалось получить прямой поток',
    }
  }
}
