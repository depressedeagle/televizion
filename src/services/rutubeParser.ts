/**
 * rutubeParser.ts
 * Парсер и нормализатор данных Rutube
 */

/**
 * Декодирование HTML-сущностей
 */
export function decodeHtmlEntities(str: unknown): string {
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
 * Парсинг длительности видео из различных форматов
 */
export function parseDuration(val: unknown): { seconds?: number; formatted?: string } {
  if (val == null) return { seconds: undefined, formatted: undefined }
  let sec = 0

  if (typeof val === 'number') {
    sec = Number.isFinite(val) ? Math.max(0, Math.floor(val)) : 0
  } else if (typeof val === 'string') {
    const trimmed = val.trim()
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
 */
export function extractRutubeId(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (!trimmed) return null

  if (/^[a-f0-9]{32}$/i.test(trimmed)) {
    return trimmed.toLowerCase()
  }

  const urlMatch = trimmed.match(/rutube\.ru\/(?:video|play\/embed|shorts)\/([a-zA-Z0-9_-]+)/i)
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1].replace(/[^a-zA-Z0-9_-]/g, '')
  }

  return null
}

/**
 * Форматирование количества просмотров на русском языке
 */
export function formatViews(hits: unknown): string {
  const num = typeof hits === 'number' && Number.isFinite(hits) ? hits : parseInt(String(hits), 10)
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
 * Нормализация URL обложки (https upgrade)
 */
export function normalizeThumbnailUrl(url: unknown): string | undefined {
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
