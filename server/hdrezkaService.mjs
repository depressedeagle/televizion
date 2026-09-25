import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  decodeTrash,
  parsePlaylist,
  parseSubtitles,
  parseCatalogHtml,
  parseMoviePageHtml,
} from './hdrezkaParser.mjs'
import { REZKA_MOVIES_DB, REZKA_DEMO_QUALITIES } from './hdrezkaData.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_FILE = path.join(__dirname, 'hdrezkaConfig.json')

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    }
  } catch (e) {
    console.warn('Failed to load hdrezkaConfig.json:', e.message)
  }
  return {}
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (e) {
    console.warn('Failed to save hdrezkaConfig.json:', e.message)
  }
}

const savedCfg = loadConfig()
let currentMirror = (savedCfg.mirrorUrl || process.env.HDREZKA_MIRROR || 'https://rezka.ag').replace(/\/+$/, '')
let currentProxy = (savedCfg.proxyUrl || process.env.HDREZKA_PROXY || '').trim()

// In-memory cache
const cache = new Map()
const CACHE_TTL_MS = 5 * 60 * 1000

let lastMirrorFailedTime = 0
const MIRROR_COOLDOWN_MS = 60 * 1000

function shouldSkipDirectMirror() {
  return Date.now() - lastMirrorFailedTime < MIRROR_COOLDOWN_MS
}

function markMirrorFailed() {
  lastMirrorFailedTime = Date.now()
}

function markMirrorSuccess() {
  lastMirrorFailedTime = 0
}

function getFromCache(key) {
  const cached = cache.get(key)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    cache.delete(key)
    return null
  }
  return cached.data
}

function setInCache(key, data, ttlMs = CACHE_TTL_MS) {
  if (cache.size > 200) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

/**
 * Стандартные заголовки для запросов к HDRezka
 */
function getHeaders(extra = {}) {
  return {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    Referer: `${currentMirror}/`,
    'X-Requested-With': 'XMLHttpRequest',
    ...extra,
  }
}

/**
 * Маршрутизация URL через прокси при наличии
 */
function proxifyUrl(url) {
  if (!currentProxy) return url
  if (currentProxy.endsWith('=') || currentProxy.endsWith('?')) {
    return currentProxy + encodeURIComponent(url)
  }
  return `${currentProxy.replace(/\/+$/, '')}/${url}`
}

export const hdrezkaService = {
  /**
   * Получить текущие настройки зеркала
   */
  getSettings() {
    return {
      mirrorUrl: currentMirror,
      proxyUrl: currentProxy,
    }
  },

  /**
   * Обновить настройки зеркала и прокси
   */
  updateSettings({ mirrorUrl, proxyUrl }) {
    if (mirrorUrl && typeof mirrorUrl === 'string') {
      currentMirror = mirrorUrl.trim().replace(/\/+$/, '')
      markMirrorSuccess()
    }
    if (typeof proxyUrl === 'string') {
      currentProxy = proxyUrl.trim()
    }
    saveConfig({ mirrorUrl: currentMirror, proxyUrl: currentProxy })
    cache.clear()
    return {
      mirrorUrl: currentMirror,
      proxyUrl: currentProxy,
    }
  },

  /**
   * Проверить доступность зеркала
   */
  async checkMirrorStatus(mirrorUrl) {
    const target = (mirrorUrl || currentMirror).replace(/\/+$/, '')
    try {
      const res = await axios.get(proxifyUrl(`${target}/`), {
        headers: getHeaders(),
        timeout: 4500,
        validateStatus: () => true,
      })
      const isOk = res.status >= 200 && res.status < 400
      return {
        ok: isOk,
        status: res.status,
        mirror: target,
        message: isOk ? 'Зеркало доступно' : `Ответ сервера: HTTP ${res.status}`,
      }
    } catch (e) {
      return {
        ok: false,
        mirror: target,
        error: e.message,
        message:
          'Зеркало недоступно. Укажите персональное зеркало, полученное от mirror@hdrezka.org',
      }
    }
  },

  /**
   * Лента каталога HDRezka (фильмы, сериалы, мультфильмы, новинки, аниме)
   */
  async getFeed(category = 'films', page = 1) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const cacheKey = `feed:${category}:${pageNum}:${currentMirror}`
    const cached = getFromCache(cacheKey)
    if (cached) return cached

    const categoryPaths = {
      films: '/films/',
      series: '/series/',
      cartoons: '/cartoons/',
      animation: '/animation/',
      new: '/new/',
    }

    const path = categoryPaths[category] || '/films/'
    const pageSegment = pageNum > 1 ? `page/${pageNum}/` : ''
    const targetUrl = `${currentMirror}${path}${pageSegment}`

    if (!shouldSkipDirectMirror()) {
      try {
        const response = await axios.get(proxifyUrl(targetUrl), {
          headers: getHeaders(),
          timeout: 3500,
        })
        const items = parseCatalogHtml(response.data, currentMirror)
        if (items && items.length > 0) {
          markMirrorSuccess()
          const result = {
            items,
            page: pageNum,
            hasNext: items.length >= 15,
            isFallback: false,
            mirror: currentMirror,
          }
          setInCache(cacheKey, result)
          return result
        }
      } catch (e) {
        console.warn(`[HDRezka] Feed error for ${targetUrl}:`, e.message)
        markMirrorFailed()
      }
    }

    // Использование богатого каталога REZKA_MOVIES_DB
    let filtered = []
    if (category === 'films') {
      filtered = REZKA_MOVIES_DB.filter((m) => m.categories?.includes('films') || !m.isSeries)
    } else if (category === 'series') {
      filtered = REZKA_MOVIES_DB.filter((m) => m.categories?.includes('series') || m.isSeries)
    } else if (category === 'cartoons') {
      filtered = REZKA_MOVIES_DB.filter((m) => m.categories?.includes('cartoons'))
    } else if (category === 'animation') {
      filtered = REZKA_MOVIES_DB.filter((m) => m.categories?.includes('animation'))
    } else if (category === 'new') {
      filtered = REZKA_MOVIES_DB.filter((m) => m.categories?.includes('new'))
    } else {
      filtered = REZKA_MOVIES_DB
    }

    const PAGE_SIZE = 12
    const total = filtered.length
    const startIndex = (pageNum - 1) * PAGE_SIZE
    const sliced = filtered.slice(startIndex, startIndex + PAGE_SIZE)
    const hasNext = startIndex + PAGE_SIZE < total

    const result = {
      items: sliced.map((m) => ({
        id: m.id,
        title: m.title,
        url: `${currentMirror}/films/${m.id}.html`,
        poster: m.poster,
        category: m.isSeries
          ? 'Сериал'
          : m.categories?.includes('cartoons')
          ? 'Мультфильм'
          : m.categories?.includes('animation')
          ? 'Аниме'
          : 'Фильм',
        quality: m.quality || '1080p',
        subtitle: `${m.year}, ${m.country}`,
        year: m.year,
        ratingKp: m.ratingKp,
        ratingImdb: m.ratingImdb,
        isSeries: m.isSeries,
      })),
      page: pageNum,
      hasNext,
      isFallback: true,
      mirror: currentMirror,
      notice:
        'Зеркало недоступно в вашей сети. Укажите актуальное зеркало от mirror@hdrezka.org в Настройках ⚙️',
    }

    return result
  },

  /**
   * Поиск по HDRezka
   */
  async search(query, page = 1) {
    const q = (query || '').trim()
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    if (!q) return { items: [], hasNext: false, page: 1 }

    const cacheKey = `search:${q}:${pageNum}:${currentMirror}`
    const cached = getFromCache(cacheKey)
    if (cached) return cached

    const searchUrl = `${currentMirror}/search/?do=search&subaction=search&q=${encodeURIComponent(q)}&page=${pageNum}`

    if (!shouldSkipDirectMirror()) {
      try {
        const response = await axios.get(proxifyUrl(searchUrl), {
          headers: getHeaders(),
          timeout: 3500,
        })
        const items = parseCatalogHtml(response.data, currentMirror)
        if (items && items.length > 0) {
          markMirrorSuccess()
          const result = {
            items,
            page: pageNum,
            hasNext: items.length >= 15,
            isFallback: false,
          }
          setInCache(cacheKey, result)
          return result
        }
      } catch (e) {
        console.warn(`[HDRezka] Search error for "${q}":`, e.message)
        markMirrorFailed()
      }
    }

    // Умный поиск по богатой базе REZKA_MOVIES_DB
    const qLower = q.toLowerCase()
    const tokens = qLower.split(/\s+/).filter(Boolean)

    const matches = REZKA_MOVIES_DB.filter((m) => {
      const titleLower = m.title.toLowerCase()
      const origLower = (m.origTitle || '').toLowerCase()
      const genresLower = (m.genres || '').toLowerCase()
      const descLower = (m.description || '').toLowerCase()

      // Прямое вхождение подстроки
      if (
        titleLower.includes(qLower) ||
        origLower.includes(qLower) ||
        genresLower.includes(qLower) ||
        descLower.includes(qLower)
      ) {
        return true
      }

      // Совпадение по каждому слову
      return (
        tokens.length > 0 &&
        tokens.every(
          (t) =>
            titleLower.includes(t) ||
            origLower.includes(t) ||
            genresLower.includes(t)
        )
      )
    })

    const PAGE_SIZE = 12
    const total = matches.length
    const startIndex = (pageNum - 1) * PAGE_SIZE
    const sliced = matches.slice(startIndex, startIndex + PAGE_SIZE)
    const hasNext = startIndex + PAGE_SIZE < total

    return {
      items: sliced.map((m) => ({
        id: m.id,
        title: m.title,
        url: `${currentMirror}/films/${m.id}.html`,
        poster: m.poster,
        category: m.isSeries
          ? 'Сериал'
          : m.categories?.includes('cartoons')
          ? 'Мультфильм'
          : m.categories?.includes('animation')
          ? 'Аниме'
          : 'Фильм',
        quality: m.quality || '1080p',
        subtitle: `${m.year}, ${m.country}`,
        year: m.year,
        ratingKp: m.ratingKp,
        ratingImdb: m.ratingImdb,
        isSeries: m.isSeries,
      })),
      page: pageNum,
      hasNext,
      isFallback: true,
      mirror: currentMirror,
      totalCount: total,
    }
  },

  /**
   * Получить детальную информацию о фильме/сериале
   */
  async getMovieDetail(urlOrId) {
    const idStr = String(urlOrId)
    const filmId = (idStr.match(/\/(\d+)[^/]*\.html/) || [])[1] || idStr

    let targetUrl = idStr
    if (!targetUrl.startsWith('http')) {
      targetUrl = `${currentMirror}/films/${filmId}.html`
    }

    const cacheKey = `detail:${targetUrl}`
    const cached = getFromCache(cacheKey)
    if (cached) return cached

    if (!shouldSkipDirectMirror()) {
      try {
        const response = await axios.get(proxifyUrl(targetUrl), {
          headers: getHeaders(),
          timeout: 3500,
        })
        const parsed = parseMoviePageHtml(response.data, targetUrl)
        if (parsed) {
          if (!parsed.kinopoiskId) {
            const match = REZKA_MOVIES_DB.find((m) => m.id === String(filmId) || m.title === parsed.title)
            if (match?.kinopoiskId) {
              parsed.kinopoiskId = match.kinopoiskId
              parsed.imdbId = match.imdbId
            }
          }
          markMirrorSuccess()
          setInCache(cacheKey, parsed)
          return parsed
        }
      } catch (e) {
        console.warn(`[HDRezka] Detail error for ${targetUrl}:`, e.message)
        markMirrorFailed()
      }
    }

    // Проверяем REZKA_MOVIES_DB
    const fallbackItem = REZKA_MOVIES_DB.find((m) => m.id === String(filmId))
    if (fallbackItem) {
      return {
        ...fallbackItem,
        url: targetUrl,
        isFallback: true,
      }
    }

    return null
  },

  /**
   * Получить поток воспроизведения видео (качества + субтитры)
   */
  async getStream({ filmId, translatorId, season, episode, isCamrip = 0, isAds = 0, isDirector = 0, favs = '' }) {
    const postData = new URLSearchParams()
    postData.set('id', String(filmId))
    postData.set('translator_id', String(translatorId || 0))
    postData.set('favs', favs || '')

    if (season && episode) {
      postData.set('season', String(season))
      postData.set('episode', String(episode))
      postData.set('action', 'get_stream')
    } else {
      postData.set('is_camrip', String(isCamrip || 0))
      postData.set('is_ads', String(isAds || 0))
      postData.set('is_director', String(isDirector || 0))
      postData.set('action', 'get_movie')
    }

    const apiUrl = `${currentMirror}/ajax/get_cdn_series/?t=${Date.now()}`

    try {
      const response = await axios.post(proxifyUrl(apiUrl), postData.toString(), {
        headers: getHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        timeout: 10000,
      })

      const data = response.data
      if (data && data.success && data.url) {
        const decodedPlaylist = decodeTrash(data.url)
        const qualities = parsePlaylist(decodedPlaylist)
        const subtitles = parseSubtitles(data.subtitle, data.subtitle_lns)

        if (qualities.length > 0) {
          return {
            success: true,
            qualities,
            subtitles,
            isFallback: false,
          }
        }
      }
    } catch (e) {
      console.warn(`[HDRezka] Stream error for film ${filmId}:`, e.message)
    }

    // Если прямой поток недоступен из-за блокировки зеркала
    return {
      success: false,
      qualities: [],
      subtitles: [],
      isFallback: true,
      isBlocked: true,
      notice:
        'Прямой поток с зеркала HDRezka недоступен (блокировка провайдера). Используйте «Онлайн-плеер» со всеми озвучками выше или укажите работающее зеркало в Настройках ⚙️',
    }
  },

  /**
   * Получить список серий для выбранного сезона и озвучки сериала
   */
  async getEpisodes({ filmId, translatorId }) {
    const postData = new URLSearchParams()
    postData.set('id', String(filmId))
    postData.set('translator_id', String(translatorId || 0))
    postData.set('action', 'get_episodes')

    const apiUrl = `${currentMirror}/ajax/get_cdn_series/`

    try {
      const response = await axios.post(proxifyUrl(apiUrl), postData.toString(), {
        headers: getHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        timeout: 8000,
      })

      const data = response.data
      if (data && data.success) {
        const cheerioMod = await import('cheerio')
        const $seasons = cheerioMod.load(data.seasons || '')
        const $episodes = cheerioMod.load(data.episodes || '')

        const seasons = []
        $seasons('.b-simple_season__item').each((_, li) => {
          seasons.push({
            id: $seasons(li).attr('data-tab_id') || '',
            name: $seasons(li).text().trim(),
          })
        })

        const episodes = []
        $episodes('.b-simple_episode__item').each((_, li) => {
          episodes.push({
            seasonId: $episodes(li).attr('data-season_id') || '',
            episodeId: $episodes(li).attr('data-episode_id') || '',
            name: $episodes(li).text().trim(),
          })
        })

        return { seasons, episodes }
      }
    } catch (e) {
      console.warn(`[HDRezka] getEpisodes error:`, e.message)
    }

    const fallbackItem = REZKA_MOVIES_DB.find((m) => m.id === String(filmId))
    return {
      seasons: fallbackItem?.seasons || [{ id: '1', name: '1 сезон' }],
      episodes: fallbackItem?.episodes || [{ seasonId: '1', episodeId: '1', name: '1 серия' }],
    }
  },
}
