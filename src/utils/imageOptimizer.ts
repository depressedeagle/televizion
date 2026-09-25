import { authService } from '../services/authService'

/**
 * Оптимизация изображений для ТВ-устройств с малым объемом оперативной памяти (1 GB RAM).
 * Ограничивает разрешение постеров, чтобы избежать падений по OOM (Out Of Memory)
 * при декодировании больших текстур в память графического чипа ТВ.
 */
export function getOptimizedPosterUrl(url: string | undefined, targetWidth = 360): string {
  if (!url) return ''
  let clean = url.trim()
  if (clean.startsWith('//')) {
    clean = 'https:' + clean
  }

  // Если это Unsplash, пережимаем через параметры w и q
  if (clean.includes('images.unsplash.com')) {
    try {
      const u = new URL(clean)
      u.searchParams.set('w', String(targetWidth))
      u.searchParams.set('auto', 'format')
      u.searchParams.set('fit', 'crop')
      u.searchParams.set('q', '75')
      return u.toString()
    } catch {
      return clean
    }
  }

  // Если это kinopoisk cdn (avatars.mds.yandex.net), запрашиваем оптимизированный размер
  if (clean.includes('avatars.mds.yandex.net/get-kinopoisk-image')) {
    return clean.replace(/\/orig$/, '/360x540').replace(/\/x1000$/, '/360x540')
  }

  // Если это TMDB image cdn
  if (clean.includes('image.tmdb.org/t/p/')) {
    const size = targetWidth <= 360 ? 'w342' : 'w500'
    return clean.replace(/\/t\/p\/(original|w780|w1280|w500|w342)\//, `/t/p/${size}/`)
  }

  // Если это rutube cdn
  if (clean.includes('pic.rutube.ru')) {
    return clean
  }

  return clean
}

/**
 * Преобразует URL изображения через прокси-сервер,
 * чтобы обходить блокировки TMDB CDN (image.tmdb.org) провайдерами РФ
 * на Smart TV в домашней сети.
 */
export function toProxyImageUrl(url: string | undefined): string {
  if (!url) return ''
  let clean = url.trim()
  if (clean.startsWith('//')) {
    clean = 'https:' + clean
  }
  const apiBase = authService.getApiBase()
  return `${apiBase}/api/image-proxy?url=${encodeURIComponent(clean)}`
}

/**
 * Многоуровневый fallback для гарантированного показа обложки фильма на ТВ:
 * - Этап 0: Официальный скоростной CDN Fastly (image.tmdb.org) или Yandex CDN для Kinopoisk
 * - Этап 1: Официальное зеркало TMDB (media.themoviedb.org)
 * - Этап 2: Скоростной кэширующий CDN Cloudflare (wsrv.nl)
 * - Этап 3: Резервное проксирование через бэкенд сервера (/api/image-proxy)
 */
export function getPosterUrlWithFallback(url: string | undefined, stage = 0): string {
  if (!url) return ''
  let clean = url.trim()
  if (clean.startsWith('//')) {
    clean = 'https:' + clean
  }

  // Если это локальные данные (data: или локальный путь)
  if (clean.startsWith('data:') || (clean.startsWith('/') && !clean.startsWith('//'))) {
    return clean
  }

  // Извлекаем чистый путь, если URL уже обернут в сторонний прокси (wsrv.nl)
  if (clean.includes('wsrv.nl') || clean.includes('images.weserv.nl')) {
    try {
      const u = new URL(clean)
      const rawUrl = u.searchParams.get('url')
      if (rawUrl) {
        clean = rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`
      }
    } catch {
      // ignore
    }
  }

  // Обработка TMDB постеров (наиболее частый случай)
  const isTmdb = clean.includes('image.tmdb.org') || clean.includes('media.themoviedb.org') || clean.includes('/t/p/')
  if (isTmdb) {
    // Извлекаем имя файла постера (например, /f5yXF2vBOxZcPxvw1P7kXXqOVFV.jpg)
    const match = clean.match(/\/t\/p\/(?:original|w\d+)?(\/[a-zA-Z0-9_\-\.]+\.(?:jpg|png|jpeg|webp))/i)
    const tmdbFile = match ? match[1] : clean.substring(clean.lastIndexOf('/'))
    const tmdbPath = `/t/p/w342${tmdbFile}`

    // Этап 0: Официальный CDN TMDB (Fastly) — без задержек и без лимитов
    if (stage === 0) {
      return `https://image.tmdb.org${tmdbPath}`
    }
    // Этап 1: Официальное зеркало TMDB (media.themoviedb.org)
    if (stage === 1) {
      return `https://media.themoviedb.org${tmdbPath}`
    }
    // Этап 2: Скоростной кэширующий CDN Cloudflare (wsrv.nl)
    if (stage === 2) {
      return `https://wsrv.nl/?url=image.tmdb.org${tmdbPath}&w=342`
    }
    // Этап 3: Бэкенд-прокси сервера Televizion
    return toProxyImageUrl(`https://image.tmdb.org${tmdbPath}`)
  }

  const optimized = getOptimizedPosterUrl(clean, 360)
  const cleanHostPath = optimized.replace(/^https?:\/\//, '')

  // Для Кинопоиска и прочих источников
  if (stage === 0) {
    return optimized
  }
  if (stage === 1) {
    return `https://wsrv.nl/?url=${cleanHostPath}&w=342`
  }
  return toProxyImageUrl(optimized)
}


