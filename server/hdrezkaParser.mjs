import * as cheerio from 'cheerio'

/**
 * Токены мусорного кода HDRezka (актуальные токены 2024-2026)
 */
const TRASH_LIST = [
  '$$!!@$$@^!@#$$@',
  '@@@@@!##!^^^',
  '####^!!##!@@',
  '^^^!@##!!##',
  '$$#!!@#!@##',
  '!@##!!@#@!',
  '!#!##!@$$@^',
  '^!@$@!##^@#',
]

/**
 * Генерация дополнительных base64 мусорных токенов для надежного декодирования
 */
const TRASH_BASE64_TOKENS = (() => {
  const set = new Set(TRASH_LIST.map((t) => Buffer.from(t).toString('base64')))
  const chars = ['@', '#', '!', '^', '$']
  // 2-символьные комбинации
  for (const c1 of chars) {
    for (const c2 of chars) {
      set.add(Buffer.from(c1 + c2).toString('base64'))
    }
  }
  // 3-символьные комбинации
  for (const c1 of chars) {
    for (const c2 of chars) {
      for (const c3 of chars) {
        set.add(Buffer.from(c1 + c2 + c3).toString('base64'))
      }
    }
  }
  return Array.from(set)
})()

/**
 * Декодирование зашифрованного URL потока HDRezka
 * @param {string} data
 * @returns {string}
 */
export function decodeTrash(data) {
  if (!data || typeof data !== 'string') return ''

  // Если префикс не начинается с #, строка может быть уже чистой
  let x = data
  if (x.startsWith('#h') || x.startsWith('#s') || x.startsWith('#m')) {
    x = x.substring(2)
  } else if (x.startsWith('#')) {
    x = x.substring(1)
  }

  // Очистка от мусорных маркеров //_//
  TRASH_LIST.forEach((t) => {
    const enc = Buffer.from(t).toString('base64')
    const token = '//_//' + enc
    x = x.split(token).join('')
  })

  // Очистка от дополнительных токенов
  TRASH_BASE64_TOKENS.forEach((token) => {
    x = x.split('//_//' + token).join('')
  })

  // Убираем любые оставшиеся разделители //_//
  x = x.split('//_//').join('')

  // Стратегия 1: Base64 decode в UTF-8
  try {
    const decoded = Buffer.from(x, 'base64').toString('utf-8')
    if (decoded && decoded.includes('http')) {
      return decoded
    }
  } catch {
    // пробуем другие методы
  }

  // Стратегия 2: проверка, если строка уже является ссылкой
  if (x.includes('http')) {
    return x
  }

  return ''
}

/**
 * Разбор строки плейлиста качества HDRezka
 * Формат: [1080p Ultra]https://a.mp4:hls:manifest.m3u8 or https://b.mp4,[720p]https://c.mp4,...
 * @param {string} playlistStr
 * @returns {Array<{ quality: string, hlsUrl: string, mp4Url: string, url: string }>}
 */
export function parsePlaylist(playlistStr) {
  if (!playlistStr || typeof playlistStr !== 'string') return []

  const QUALITY_ORDER = ['1080p Ultra', '1080p', '720p', '480p', '360p']
  const results = []

  const parts = playlistStr.split(',')
  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    const match = trimmed.match(/\[([^\]]+)\](.+)/)
    if (!match) continue

    const quality = match[1].trim()
    const urlsRaw = match[2].trim()

    // Разделение по " or "
    const urlVariants = urlsRaw.split(' or ').map((u) => u.trim()).filter(Boolean)
    let hlsUrl = ''
    let mp4Url = ''

    for (const u of urlVariants) {
      if (u.includes(':hls:manifest.m3u8') || u.endsWith('.m3u8')) {
        hlsUrl = u
      } else if (u.endsWith('.mp4') || u.includes('.mp4?')) {
        mp4Url = u
      }
    }

    // Если m3u8 не найден явно, но есть ссылка с :hls:, нормализуем
    if (!hlsUrl && urlVariants.length > 0) {
      hlsUrl = urlVariants[0]
    }
    if (!mp4Url && urlVariants.length > 1) {
      mp4Url = urlVariants[1]
    } else if (!mp4Url) {
      mp4Url = urlVariants[0]
    }

    results.push({
      quality,
      hlsUrl: hlsUrl.replace(':hls:manifest.m3u8', ''), // или прямой m3u8
      mp4Url: mp4Url,
      url: hlsUrl || mp4Url,
    })
  }

  // Сортировка от наилучшего к меньшему
  results.sort((a, b) => {
    const ia = QUALITY_ORDER.indexOf(a.quality)
    const ib = QUALITY_ORDER.indexOf(b.quality)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return results
}

/**
 * Парсинг субтитров из ответа HDRezka
 * @param {string} subStr - строка субтитров, например "[rus]https://.../rus.vtt,[eng]https://..."
 * @param {Record<string, string>} subLns - сопоставление кодов и названий, например {"rus": "Русский"}
 * @returns {Array<{ lang: string, label: string, url: string }>}
 */
export function parseSubtitles(subStr, subLns = {}) {
  if (!subStr || typeof subStr !== 'string') return []
  const list = []
  const parts = subStr.split(',')
  for (const part of parts) {
    const match = part.trim().match(/\[([^\]]+)\](.+)/)
    if (match) {
      const code = match[1].trim()
      const url = match[2].trim()
      const label = subLns[code] || code.toUpperCase()
      list.push({ lang: code, label, url })
    }
  }
  return list
}

/**
 * Парсинг каталога HDRezka (фильмы, сериалы, новинки)
 * @param {string} html
 * @param {string} baseUrl
 * @returns {Array<object>}
 */
export function parseCatalogHtml(html, baseUrl = 'https://rezka.ag') {
  if (!html) return []
  const $ = cheerio.load(html)
  const items = []

  $('.b-content__inline_item').each((_, el) => {
    const $el = $(el)
    const id = $el.attr('data-id') || ''
    const linkEl = $el.find('.b-content__inline_item-link a')
    const title = linkEl.text().trim()
    const relUrl = linkEl.attr('href') || $el.attr('data-url') || ''
    const fullUrl = relUrl.startsWith('http') ? relUrl : new URL(relUrl, baseUrl).toString()

    const imgEl = $el.find('.b-content__inline_item-cover img')
    let poster = imgEl.attr('src') || ''
    if (poster.startsWith('//')) poster = 'https:' + poster
    else if (poster && !poster.startsWith('http')) poster = new URL(poster, baseUrl).toString()

    const catBadge = $el.find('.cat').text().trim() || 'Фильм'
    const qualityBadge = $el.find('.entity').text().trim() || 'HD'
    const infoText = $el.find('.b-content__inline_item-link div').text().trim()

    // Извлечение года
    const yearMatch = infoText.match(/\b(19\d{2}|20\d{2})\b/)
    const year = yearMatch ? yearMatch[1] : undefined

    if (id || fullUrl) {
      items.push({
        id: id || fullUrl,
        title: title || 'Без названия',
        url: fullUrl,
        poster,
        category: catBadge,
        quality: qualityBadge,
        subtitle: infoText || year || catBadge,
        year,
      })
    }
  })

  return items
}

/**
 * Парсинг страницы конкретного фильма или сериала HDRezka
 * @param {string} html
 * @param {string} pageUrl
 * @returns {object | null}
 */
export function parseMoviePageHtml(html, pageUrl) {
  if (!html) return null
  const $ = cheerio.load(html)

  // 1. Поиск initCDNSeriesEvents / initCDNMoviesEvents
  const initMatch = html.match(
    /initCDN(?:Series|Movies)Events\(\s*(\d+)\s*,\s*(\d+)\s*,\s*([01])\s*,\s*([01])\s*(?:,\s*([01]))?/
  )

  const isSeries = /initCDNSeriesEvents/.test(html)
  const filmId = initMatch ? initMatch[1] : $('#post_id').val() || ''
  const defVoiceId = initMatch ? initMatch[2] : '0'
  const isCamrip = initMatch ? initMatch[3] : '0'
  const isAds = initMatch ? initMatch[4] : '0'
  const isDirector = initMatch && initMatch[5] ? initMatch[5] : '0'

  if (!filmId) {
    return null
  }

  // Название
  const title = $('.b-post__title h1').text().trim() || $('.b-post__title').text().trim() || 'Фильм'
  const origTitle = $('.b-post__origtitle').text().trim()

  // Постер
  let poster = $('.b-sidecover img').attr('src') || ''
  if (poster.startsWith('//')) poster = 'https:' + poster

  // Описание
  const description = $('.b-post__description_text').text().trim()

  // Рейтинги и метаданные из таблицы b-post__info
  let year = ''
  let country = ''
  let genres = ''
  let duration = ''
  let ratingKp = ''
  let ratingImdb = ''

  $('.b-post__info tr').each((_, tr) => {
    const text = $(tr).text().trim()
    if (text.includes('Год:')) {
      const ym = text.match(/\b(19\d{2}|20\d{2})\b/)
      if (ym) year = ym[1]
    } else if (text.includes('Страна:')) {
      country = $(tr).find('td').last().text().trim()
    } else if (text.includes('Жанр:')) {
      genres = $(tr).find('td').last().text().trim()
    } else if (text.includes('Время:') || text.includes('Продолжительность:')) {
      duration = $(tr).find('td').last().text().trim()
    } else if (text.includes('IMDb:')) {
      const m = text.match(/IMDb:\s*([\d.]+)/i)
      if (m) ratingImdb = m[1]
    } else if (text.includes('Кинопоиск:')) {
      const m = text.match(/Кинопоиск:\s*([\d.]+)/i)
      if (m) ratingKp = m[1]
    }
  })

  // Favs hash для запроса видеопотока
  let favs = ''
  const favsMatch = html.match(/var\s+sof\s*=.*?\.send\([^,]+,\s*'([^']+)'/) || html.match(/data-favs="([^"]+)"/)
  if (favsMatch) favs = favsMatch[1]

  // Озвучки / Переводы
  const translators = []
  const $translators = $('#translators-list')
  if ($translators.length > 0) {
    $translators.find('.b-translator__item').each((_, li) => {
      const $li = $(li)
      const trId = $li.attr('data-translator_id') || defVoiceId
      const name = ($li.attr('title') || $li.text() || '').trim()
      translators.push({
        id: trId,
        name: name || 'Оригинал',
        isCamrip: $li.attr('data-camrip') || isCamrip,
        isAds: $li.attr('data-ads') || isAds,
        isDirector: $li.attr('data-director') || isDirector,
        isDefault: trId === defVoiceId,
      })
    })
  }

  // Если список переводов пуст, создаем дефолтный
  if (translators.length === 0) {
    let defName = 'Оригинал / Дубляж'
    $('.b-post__info tr').each((_, tr) => {
      if ($(tr).text().includes('переводе')) {
        defName = $(tr).find('td').last().text().trim() || defName
      }
    })
    translators.push({
      id: defVoiceId,
      name: defName,
      isCamrip,
      isAds,
      isDirector,
      isDefault: true,
    })
  }

  // Сезоны и серии (для сериалов)
  const seasons = []
  const episodes = []

  if (isSeries) {
    $('.b-simple_season__item').each((_, li) => {
      const $li = $(li)
      seasons.push({
        id: $li.attr('data-tab_id') || '',
        name: $li.text().trim(),
      })
    })

    $('.b-simple_episode__item').each((_, li) => {
      const $li = $(li)
      episodes.push({
        seasonId: $li.attr('data-season_id') || '',
        episodeId: $li.attr('data-episode_id') || '',
        name: $li.text().trim(),
      })
    })
  }

  return {
    id: filmId,
    title,
    origTitle,
    poster,
    description,
    year,
    country,
    genres,
    duration,
    ratingKp,
    ratingImdb,
    isSeries,
    favs,
    url: pageUrl,
    translators,
    seasons,
    episodes,
  }
}
