export interface RezkaMovieItem {
  id: string
  title: string
  url: string
  poster: string
  category: string
  quality?: string
  subtitle?: string
  year?: string
  ratingKp?: string
  ratingImdb?: string
  genres?: string
  country?: string
  duration?: string
  description?: string
  isSeries?: boolean
  kinopoiskId?: string
  imdbId?: string
}

export interface RezkaTranslator {
  id: string
  name: string
  isCamrip?: number | string
  isAds?: number | string
  isDirector?: number | string
  isDefault?: boolean
}

export interface RezkaSeason {
  id: string
  name: string
}

export interface RezkaEpisode {
  seasonId: string
  episodeId: string
  name: string
}

export interface RezkaMovieDetail extends RezkaMovieItem {
  origTitle?: string
  favs?: string
  translators: RezkaTranslator[]
  seasons?: RezkaSeason[]
  episodes?: RezkaEpisode[]
  isFallback?: boolean
}

export interface RezkaStreamQuality {
  quality: string
  hlsUrl: string
  mp4Url: string
  url: string
}

export interface RezkaSubtitle {
  lang: string
  label: string
  url: string
}

export interface RezkaStreamResponse {
  success: boolean
  qualities: RezkaStreamQuality[]
  subtitles: RezkaSubtitle[]
  isFallback?: boolean
  isBlocked?: boolean
  notice?: string
  error?: string
}

export interface RezkaFeedResponse {
  items: RezkaMovieItem[]
  page: number
  hasNext: boolean
  isFallback: boolean
  mirror?: string
  notice?: string
}

export interface RezkaSettings {
  mirrorUrl: string
  proxyUrl?: string
}

export interface RezkaStatusResponse {
  ok: boolean
  mirror: string
  status?: number
  message: string
  error?: string
}

import { authService } from './authService'

async function requestJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, authService.getApiBase())
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== '') url.searchParams.set(key, value)
    })
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error(`Rezka API error: ${res.status}`)
  }
  return (await res.json()) as T
}

export async function fetchRezkaFeed(category = 'films', page = 1): Promise<RezkaFeedResponse> {
  return requestJson<RezkaFeedResponse>('/api/rezka/feed', {
    category,
    page: String(page),
  })
}

export async function searchRezka(query: string, page = 1): Promise<RezkaFeedResponse> {
  return requestJson<RezkaFeedResponse>('/api/rezka/search', {
    q: query,
    page: String(page),
  })
}

export async function fetchRezkaMovieDetail(urlOrId: string): Promise<RezkaMovieDetail> {
  return requestJson<RezkaMovieDetail>('/api/rezka/detail', {
    url: urlOrId,
    id: urlOrId,
  })
}

export async function fetchRezkaStream(params: {
  filmId: string
  translatorId?: string
  season?: string
  episode?: string
  isCamrip?: number
  isAds?: number
  isDirector?: number
  favs?: string
}): Promise<RezkaStreamResponse> {
  const qParams: Record<string, string> = {
    id: params.filmId,
  }
  if (params.translatorId) qParams.translator_id = params.translatorId
  if (params.season) qParams.season = params.season
  if (params.episode) qParams.episode = params.episode
  if (params.isCamrip) qParams.is_camrip = String(params.isCamrip)
  if (params.isAds) qParams.is_ads = String(params.isAds)
  if (params.isDirector) qParams.is_director = String(params.isDirector)
  if (params.favs) qParams.favs = params.favs

  return requestJson<RezkaStreamResponse>('/api/rezka/stream', qParams)
}

export async function fetchRezkaEpisodes(filmId: string, translatorId: string): Promise<{
  seasons: RezkaSeason[]
  episodes: RezkaEpisode[]
}> {
  return requestJson('/api/rezka/episodes', {
    id: filmId,
    translator_id: translatorId,
  })
}

export async function fetchRezkaSettings(): Promise<RezkaSettings> {
  return requestJson<RezkaSettings>('/api/rezka/settings')
}

export async function updateRezkaSettings(settings: RezkaSettings): Promise<{ success: boolean; settings: RezkaSettings }> {
  const url = new URL('/api/rezka/settings', authService.getApiBase())
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) throw new Error(`Settings update failed: ${res.status}`)
  return res.json()
}

export async function checkRezkaStatus(mirrorUrl?: string): Promise<RezkaStatusResponse> {
  const params: Record<string, string> = {}
  if (mirrorUrl) params.url = mirrorUrl
  return requestJson<RezkaStatusResponse>('/api/rezka/status', params)
}

const REZKA_PROGRESS_PREFIX = 'rezka_progress_'

export function getStoredRezkaProgress(filmId: string, season?: string, episode?: string): number | null {
  try {
    const key = `${REZKA_PROGRESS_PREFIX}${filmId}${season ? `_s${season}` : ''}${episode ? `_e${episode}` : ''}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

export function setStoredRezkaProgress(filmId: string, seconds: number, season?: string, episode?: string): void {
  try {
    const key = `${REZKA_PROGRESS_PREFIX}${filmId}${season ? `_s${season}` : ''}${episode ? `_e${episode}` : ''}`
    if (seconds >= 0) {
      localStorage.setItem(key, String(Math.floor(seconds)))
    }
  } catch {
    // ignore
  }
}
