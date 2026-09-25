/**
 * rutubeParser.mjs
 * Надежный парсер и нормализатор данных Rutube API
 */

/**
 * Декодирование HTML-сущностей в тексте (названия видео, описания, имена авторов)
 * @param {unknown} str
 * @returns {string}
 */
export function decodeHtmlEntities(str) {
  if (typeof str !== 'string' || !str) return ''
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        const code = Number(dec)
        return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ''
      } catch {
        return ''
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        const code = parseInt(hex, 16)
        return code > 0 && code < 0x10ffff ? String.fromCodePoint(code) : ''
      } catch {
        return ''
      }
    })
    .trim()
}

/**
 * Парсинг длительности видео из различных форматов Rutube
 * Поддерживает: число (секунды), числовую строку, ISO 8601 (PT1H2M3S), таймкод (MM:SS / HH:MM:SS)
 * @param {unknown} val
 * @returns {{ seconds: number | undefined, formatted: string | undefined }}
 */
export function parseDuration(val) {
  if (val == null) return { seconds: undefined, formatted: undefined }
  let sec = 0

  if (typeof val === 'number') {
    sec = Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
    // ISO 8601: PT1H2M30S или PT45S
    const isoMatch = trimmed.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i)
    if (isoMatch && (isoMatch[1] || isoMatch[2] || isoMatch[3])) {
      const h = parseInt(isoMatch[1] || '0', 10)
      const m = parseInt(isoMatch[2] || '0', 10)
      const s = parseInt(isoMatch[3] || '0', 10)
      sec = h * 3600 + m * 60 + s
    } else if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => parseInt(p, 10))
      if (parts.length === 2 && parts.every((p) => Number.isFinite(p) && p >= 0)) {
        sec = parts[0] * 60 + parts[1]
      } else if (parts.length === 3 && parts.every((p) => Number.isFinite(p) && p >= 0)) {
        sec = parts[0] * 3600 + parts[1] * 60 + parts[2]
      }
    } else {
      const parsed = parseInt(trimmed, 10)
      if (Number.isFinite(parsed) && parsed >= 0) {
        sec = parsed
      }
    }
  }

  if (sec <= 0 && val !== 0 && val !== '0') {
    return { seconds: undefined, formatted: undefined }
  }

  const hours = Math.floor(sec / 3600)
  const minutes = Math.floor((sec % 3600) / 60)
  const seconds = sec % 60

  const formatted =
    hours > 0
      ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      : `${minutes}:${seconds.toString().padStart(2, '0')}`

  return { seconds: sec, formatted }
}

/**
 * Извлечение ID видео Rutube из произвольной строки или URL
 * Поддерживает:
 * - 32-значный hex hash (a-f0-9)
 * - https://rutube.ru/video/HASH/
 * - https://rutube.ru/play/embed/HASH
 * - https://rutube.ru/shorts/HASH/
 * @param {unknown} input
 * @returns {string | null}
 */
export function extractRutubeId(input) {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  // Прямой 32-значный hex ID
  if (/^[a-f0-9]{32}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  // URL-ссылка
  const urlMatch = trimmed.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([a-zA-Z0-9_-]+)/i)
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/[^a-zA-Z0-9_-]/g, '')
  }

  return null
}

/**
 * Форматирование количества просмотров на русском языке
 * @param {unknown} hits
 * @returns {string}
 */
export function formatViews(hits) {
  const num = typeof hits === 'number' && Number.isFinite(hits) ? hits : parseInt(hits, 10)
  if (!Number.isFinite(num) || num <= 0) return ''
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1).replace('.0', '')} млн просмотров`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1).replace('.0', '')} тыс. просмотров`
  }
  return `${num} просмотров`
}

/**
 * Нормализация URL обложки (https upgrade, исключение битых ссылок)
 * @param {unknown} url
 * @returns {string | undefined}
 */
export function normalizeThumbnailUrl(url) {
  if (typeof url !== 'string') return undefined
  let trimmed = url.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('//')) {
    trimmed = 'https:' + trimmed
  } else if (trimmed.startsWith('http://')) {
    trimmed = trimmed.replace('http://', 'https://')
  }
  return trimmed.startsWith('https://') ? trimmed : undefined
}

/**
 * Преобразование сырого элемента ответа Rutube API в валидный и чистый объект видео
 * @param {unknown} v
 * @returns {object | null}
 */
export function toItem(v) {
  if (!v || typeof v !== 'object') return null

  // Извлечение ID
  let id = v.id != null ? String(v.id).trim() : ''
  if (!id || id === 'undefined' || id === 'null') {
    if (v.video_url) id = extractRutubeId(v.video_url) || ''
    if (!id && v.embed_url) id = extractRutubeId(v.embed_url) || ''
    if (!id && v.track_id) id = String(v.track_id)
  }
  if (!id) return null

  // Название
  const rawTitle = v.title || v.name || 'Видео'
  const title = decodeHtmlEntities(rawTitle) || 'Видео'

  // Длительность
  const { seconds: duration, formatted: durationFormatted } = parseDuration(v.duration)

  // Обложка
  const rawThumb =
    v.thumbnail_url ||
    v.picture_url ||
    v.picture ||
    v.preview_url ||
    v.poster_picture ||
    v.first_frame_url ||
    v.thumbnail
  const thumbnailUrl = normalizeThumbnailUrl(rawThumb)

  // Автор / канал
  let author = undefined
  if (v.author && typeof v.author === 'object') {
    const authorName = decodeHtmlEntities(v.author.name || v.author.title || '')
    const avatar = normalizeThumbnailUrl(v.author.avatar_url)
    if (authorName) {
      author = {
        id: v.author.id != null ? String(v.author.id) : undefined,
        name: authorName,
        avatarUrl: avatar,
      }
    }
  } else if (v.feed_name) {
    const authorName = decodeHtmlEntities(v.feed_name)
    if (authorName) {
      author = { name: authorName }
    }
  }

  // Просмотры
  const hitsNum = typeof v.hits === 'number' && Number.isFinite(v.hits) ? v.hits : parseInt(v.hits, 10)
  const hits = Number.isFinite(hitsNum) && hitsNum >= 0 ? hitsNum : 0
  const viewsText = formatViews(hits)

  // Дата публикации
  const publicationDate = v.publication_ts || v.created_ts || undefined

  // Категория
  let category = undefined
  if (v.category && typeof v.category === 'object') {
    category = {
      id: v.category.id,
      name: decodeHtmlEntities(v.category.name || ''),
    }
  }

  return {
    id,
    title,
    duration,
    durationFormatted,
    thumbnail_url: thumbnailUrl,
    video_url: v.video_url || `https://rutube.ru/video/${id}/`,
    embed_url: v.embed_url || `https://rutube.ru/play/embed/${id}`,
    author,
    hits,
    viewsText,
    publicationDate,
    category,
    description: decodeHtmlEntities(v.description || ''),
  }
}
