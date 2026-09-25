import type { MovieDetail, FeedResponse } from '../types/movie'
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
    throw new Error(`TMDB API error: ${res.status}`)
  }
  return (await res.json()) as T
}

/**
 * Загрузить ленту TMDB по категории (films, series, cartoons, animation, new)
 */
export async function fetchTmdbFeed(category = 'films', page = 1): Promise<FeedResponse> {
  return requestJson<FeedResponse>('/api/tmdb/feed', {
    category,
    page: String(page),
  })
}

/**
 * Поиск по каталогу TMDB
 */
export async function searchTmdb(query: string, page = 1): Promise<FeedResponse> {
  return requestJson<FeedResponse>('/api/tmdb/search', {
    q: query,
    page: String(page),
  })
}

/**
 * Детали фильма или сериала TMDB
 */
export async function fetchTmdbMovieDetail(idOrTmdbId: string): Promise<MovieDetail> {
  return requestJson<MovieDetail>('/api/tmdb/detail', {
    id: idOrTmdbId,
  })
}
