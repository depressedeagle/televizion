export type BalancerId = 'kodik' | 'collaps' | 'kinobox' | 'voidboost' | 'alloha' | 'rezka' | 'trailer'

export interface BalancerSource {
  id: BalancerId
  name: string
  label: string
  iframeUrl: string
  priority: number
  badge?: string
  description?: string
}

export interface KodikTranslationItem {
  id: string
  title: string
  type: string
}

export interface KodikSeasonItem {
  number: number
  name: string
  episodeCount: number
}

import { authService } from './authService'

export interface KodikEpisodeItem {
  number: number
  name: string
  link: string
}

export interface KodikDetailsResponse {
  success: boolean
  found: boolean
  defaultLink: string
  title: string
  translations: KodikTranslationItem[]
  seasons: KodikSeasonItem[]
  episodesMap: Record<string, KodikEpisodeItem[]>
  isFallback?: boolean
}

/**
 * Загрузить список доступных балансеров для тайтла
 */
export async function fetchBalancerSources(params: {
  kinopoiskId?: string
  imdbId?: string
  title?: string
  isAnime?: boolean
  isSeries?: boolean
}): Promise<BalancerSource[]> {
  try {
    const url = new URL('/api/balancer/sources', authService.getApiBase())
    if (params.kinopoiskId) url.searchParams.set('kinopoiskId', params.kinopoiskId)
    if (params.imdbId) url.searchParams.set('imdbId', params.imdbId)
    if (params.title) url.searchParams.set('title', params.title)
    if (params.isAnime) url.searchParams.set('isAnime', 'true')
    if (params.isSeries) url.searchParams.set('isSeries', 'true')

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`Balancer API error: ${res.status}`)
    const data = await res.json()
    return Array.isArray(data.sources) ? data.sources : []
  } catch (err) {
    console.warn('Could not fetch balancer sources from server, using local fallbacks:', err)
    // Fallback локально если сервер оффлайн
    const kpId = params.kinopoiskId || ''
    const title = params.title || ''
    const fallbackSources: BalancerSource[] = [
      {
        id: 'collaps',
        name: 'Collaps',
        label: '✨ Collaps (Основной)',
        iframeUrl: kpId ? `https://api.namy.ws/embed/kp/${kpId}` : '',
        priority: 1,
        badge: 'Full HD',
      },
      {
        id: 'kodik',
        name: 'Kodik',
        label: '🎌 Kodik (Аниме / Дорамы)',
        iframeUrl: kpId
          ? `https://kodikplayer.com/find-player?kinopoiskID=${kpId}`
          : `https://kodikplayer.com/find-player?title=${encodeURIComponent(title)}`,
        priority: 2,
        badge: 'Аниме & Дорамы',
      },
      {
        id: 'kinobox',
        name: 'Kinobox',
        label: '⚡ Kinobox',
        iframeUrl: kpId ? `https://kinobox.tv/api/players?kinopoisk=${kpId}` : '',
        priority: 3,
        badge: 'Мульти',
      },
      {
        id: 'voidboost',
        name: 'Voidboost',
        label: '🚀 Voidboost',
        iframeUrl: kpId ? `https://voidboost.net/embed/${kpId}` : '',
        priority: 4,
        badge: 'Запасной',
      },
    ]
    return fallbackSources.filter((s) => Boolean(s.iframeUrl))
  }
}

/**
 * Загрузить данные Kodik (озвучки, сезоны, серии)
 */
export async function fetchKodikDetails(params: {
  kinopoiskId?: string
  title?: string
}): Promise<KodikDetailsResponse | null> {
  try {
    const url = new URL('/api/balancer/kodik', authService.getApiBase())
    if (params.kinopoiskId) url.searchParams.set('kinopoiskId', params.kinopoiskId)
    if (params.title) url.searchParams.set('title', params.title)

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`Kodik API error: ${res.status}`)
    return (await res.json()) as KodikDetailsResponse
  } catch (err) {
    console.warn('Could not fetch Kodik details:', err)
    return null
  }
}
