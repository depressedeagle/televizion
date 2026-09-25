/**
 * Управление историей и прогрессом воспроизведения:
 * - Запоминание последней просмотренной серии и сезона
 * - Сохранение таймкода фильма/серии
 * - Отметка о просмотренных сериях
 * - Удаление и очистка истории
 * - Форматирование времени просмотра
 */

export interface WatchProgressRecord {
  movieId: string
  movieTitle: string
  moviePoster?: string
  isSeries?: boolean
  season?: string | number
  episode?: string | number
  currentTime: number
  duration: number
  updatedAt: number
}

const STORAGE_PREFIX = 'tv_progress_'
const WATCHED_EPISODES_PREFIX = 'tv_watched_episodes_'
const RECENT_LIMIT = 50

function notifyChange(): void {
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('tv_watch_progress_updated'))
    } catch {
      // ignore
    }
  }
}

export function saveWatchProgress(record: {
  movieId: string
  movieTitle: string
  moviePoster?: string
  isSeries?: boolean
  season?: string | number
  episode?: string | number
  currentTime: number
  duration?: number
}): void {
  try {
    const key = `${STORAGE_PREFIX}${record.movieId}`
    const existing = getWatchProgress(record.movieId)

    const updated: WatchProgressRecord = {
      movieId: record.movieId,
      movieTitle: record.movieTitle,
      moviePoster: record.moviePoster || existing?.moviePoster,
      isSeries: record.isSeries ?? existing?.isSeries ?? false,
      season: record.season !== undefined ? record.season : existing?.season,
      episode: record.episode !== undefined ? record.episode : existing?.episode,
      currentTime: Math.floor(record.currentTime),
      duration: Math.floor(record.duration || existing?.duration || 0),
      updatedAt: Date.now(),
    }

    localStorage.setItem(key, JSON.stringify(updated))

    // Если серия просмотрена более чем на 80%, помечаем её как просмотренную
    if (record.isSeries && record.season && record.episode && record.duration && record.duration > 0) {
      if (record.currentTime / record.duration > 0.8) {
        markEpisodeWatched(record.movieId, record.season, record.episode)
      }
    }

    notifyChange()
  } catch (e) {
    console.warn('Failed to save watch progress:', e)
  }
}

export function getWatchProgress(movieId: string): WatchProgressRecord | null {
  try {
    const key = `${STORAGE_PREFIX}${movieId}`
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as WatchProgressRecord
  } catch {
    return null
  }
}

export function deleteWatchProgress(movieId: string): void {
  try {
    const key = `${STORAGE_PREFIX}${movieId}`
    localStorage.removeItem(key)
    notifyChange()
  } catch (e) {
    console.warn('Failed to delete watch progress:', e)
  }
}

export function clearAllWatchProgress(): void {
  try {
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) {
        keysToRemove.push(k)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
    notifyChange()
  } catch (e) {
    console.warn('Failed to clear watch progress:', e)
  }
}

export function markEpisodeWatched(
  movieId: string,
  season: string | number,
  episode: string | number
): void {
  try {
    const key = `${WATCHED_EPISODES_PREFIX}${movieId}`
    const raw = localStorage.getItem(key)
    const list: string[] = raw ? JSON.parse(raw) : []
    const epKey = `s${season}_e${episode}`
    if (!list.includes(epKey)) {
      list.push(epKey)
      localStorage.setItem(key, JSON.stringify(list))
    }
  } catch {
    // ignore
  }
}

export function isEpisodeWatched(
  movieId: string,
  season: string | number,
  episode: string | number
): boolean {
  try {
    const key = `${WATCHED_EPISODES_PREFIX}${movieId}`
    const raw = localStorage.getItem(key)
    if (!raw) return false
    const list: string[] = JSON.parse(raw)
    return Array.isArray(list) && list.includes(`s${season}_e${episode}`)
  } catch {
    return false
  }
}

export function getAllWatchProgress(): WatchProgressRecord[] {
  try {
    const results: WatchProgressRecord[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX)) {
        const raw = localStorage.getItem(k)
        if (raw) {
          try {
            results.push(JSON.parse(raw))
          } catch {
            // ignore
          }
        }
      }
    }
    return results
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, RECENT_LIMIT)
  } catch {
    return []
  }
}

/**
 * Форматирование секунд в человекочитаемый вид: "42:15" или "1:15:30"
 */
export function formatWatchTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0 || !Number.isFinite(totalSeconds)) return '0:00'
  const secs = Math.floor(totalSeconds)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }
  return `${m}:${s.toString().padStart(2, '0')}`
}
