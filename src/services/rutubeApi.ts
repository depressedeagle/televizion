export interface VideoAuthor {
  id?: string
  name: string
  avatarUrl?: string
}

export interface VideoListItem {
  id: string
  title: string
  subtitle?: string
  thumbnailUrl?: string
  author?: VideoAuthor
  hits?: number
  viewsText?: string
  duration?: number
  durationFormatted?: string
  publicationDate?: string
  description?: string
  embedUrl?: string
}

export interface VideoDetailItem extends VideoListItem {
  category?: {
    id: number
    name: string
  }
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
    headers: {
      Accept: 'application/json',
    },
  })
  if (!res.ok) {
    throw new Error(`Rutube backend error: ${res.status}`)
  }

  return (await res.json()) as T
}

function formatDuration(sec: number): string {
  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = sec % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export interface FeedResponse {
  items: VideoListItem[]
  hasNext: boolean
  page: number
}

interface RawVideoItem {
  id: string
  title?: string
  duration?: number
  durationFormatted?: string
  thumbnail_url?: string
  author?: { id?: string; name: string; avatarUrl?: string }
  hits?: number
  viewsText?: string
  publicationDate?: string
  description?: string
  embed_url?: string
  category?: { id: number; name: string }
}

function normalizeRawItem(item: RawVideoItem): VideoListItem {
  const durationSec = typeof item.duration === 'number' ? item.duration : undefined
  const formattedDur =
    item.durationFormatted || (durationSec != null ? formatDuration(durationSec) : undefined)

  // Subtitle format: e.g. "Канал • 2:05" or "1.5 тыс. просмотров • 2:05"
  const subtitleParts: string[] = []
  if (item.author?.name) {
    subtitleParts.push(item.author.name)
  }
  if (item.viewsText) {
    subtitleParts.push(item.viewsText)
  } else if (formattedDur) {
    subtitleParts.push(formattedDur)
  }

  return {
    id: item.id,
    title: item.title || 'Видео',
    subtitle: subtitleParts.length > 0 ? subtitleParts.join(' • ') : formattedDur,
    thumbnailUrl: item.thumbnail_url || undefined,
    author: item.author,
    hits: item.hits,
    viewsText: item.viewsText,
    duration: durationSec,
    durationFormatted: formattedDur,
    publicationDate: item.publicationDate,
    description: item.description,
    embedUrl: item.embed_url,
  }
}

export async function fetchFeed(page = 1, category?: string): Promise<FeedResponse> {
  const params: Record<string, string> = { page: String(page), limit: '24' }
  if (category) params.category = category
  const data = await requestJson<{
    items: RawVideoItem[]
    hasNext?: boolean
    page?: number
  }>('/api/videos/feed', params)

  const items = (data.items ?? []).map(normalizeRawItem)
  return {
    items,
    hasNext: Boolean(data.hasNext),
    page: data.page ?? page,
  }
}

export async function searchVideos(query: string, page = 1): Promise<VideoListItem[]> {
  const data = await requestJson<{
    items: RawVideoItem[]
    hasNext?: boolean
    page?: number
  }>('/api/videos/search', { q: query, page: String(page), limit: '24' })

  return (data.items ?? []).map(normalizeRawItem)
}

export async function searchVideosWithPagination(
  query: string,
  page = 1
): Promise<{ items: VideoListItem[]; hasNext: boolean; page: number }> {
  const data = await requestJson<{
    items: RawVideoItem[]
    hasNext?: boolean
    page?: number
  }>('/api/videos/search', { q: query, page: String(page), limit: '24' })

  return {
    items: (data.items ?? []).map(normalizeRawItem),
    hasNext: Boolean(data.hasNext),
    page: data.page ?? page,
  }
}

export async function fetchVideoDetail(videoId: string): Promise<VideoDetailItem> {
  const data = await requestJson<RawVideoItem>(`/api/videos/detail/${videoId}`)
  const base = normalizeRawItem(data)
  return {
    ...base,
    category: data.category,
  }
}

export async function fetchRelatedVideos(videoId: string): Promise<VideoListItem[]> {
  try {
    const data = await requestJson<{ items: RawVideoItem[] }>(`/api/videos/related/${videoId}`)
    return (data.items ?? []).map(normalizeRawItem)
  } catch {
    return []
  }
}

export async function fetchCategories(): Promise<{ id: string; label: string }[]> {
  try {
    return await requestJson<{ id: string; label: string }[]>('/api/videos/categories')
  } catch {
    return [
      { id: 'default', label: 'Лента' },
      { id: 'auto', label: 'Авто' },
      { id: 'humor', label: 'Юмор' },
      { id: 'lifehacks', label: 'Лайфхаки' },
      { id: 'games', label: 'Игры' },
      { id: 'kino', label: 'Фильмы' },
      { id: 'cartoons', label: 'Мультфильмы' },
      { id: 'music', label: 'Музыка' },
      { id: 'technologies', label: 'Технологии' },
      { id: 'food', label: 'Еда' },
      { id: 'sport', label: 'Спорт' },
      { id: 'science', label: 'Наука' },
    ]
  }
}

const PROGRESS_KEY_PREFIX = 'televizion_progress_'

/** URL для встраивания плеера Rutube (bmstart — время старта в секундах, loop — автоповтор) */
export function getEmbedUrl(videoId: string, startSeconds?: number, loop?: boolean): string {
  const base = `https://rutube.ru/play/embed/${videoId}`
  const params = new URLSearchParams()
  if (startSeconds != null && startSeconds > 0) {
    params.set('bmstart', String(Math.floor(startSeconds)))
  }
  if (loop) {
    params.set('loop', '1')
  }
  const query = params.toString()
  return query ? `${base}?${query}` : base
}

export function getStoredProgress(videoId: string): number | null {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY_PREFIX + videoId)
    if (raw == null) return null
    const n = parseInt(raw, 10)
    return Number.isFinite(n) && n >= 0 ? n : null
  } catch {
    return null
  }
}

export function setStoredProgress(videoId: string, seconds: number): void {
  try {
    const s = Math.floor(seconds)
    if (s >= 0) localStorage.setItem(PROGRESS_KEY_PREFIX + videoId, String(s))
  } catch {
    // ignore
  }
}
