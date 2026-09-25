import 'dotenv/config'
import { Readable } from 'node:stream'
import express from 'express'
import cors from 'cors'
import axios from 'axios'
import {
  decodeHtmlEntities,
  parseDuration,
  extractRutubeId,
  formatViews,
  normalizeThumbnailUrl,
  toItem,
} from './rutubeParser.mjs'
import { hdrezkaService } from './hdrezkaService.mjs'
import { getBalancerSources, getKodikDetails } from './balancerService.mjs'
import { getTmdbFeed, searchTmdb, getTmdbDetail } from './tmdbService.mjs'
import { authService } from './authService.mjs'
import { extractDirectStream } from './streamExtractor.mjs'

const PORT = process.env.PORT || 3001
const RUTUBE_API = 'https://rutube.ru/api'

console.log('[Televizion] Movie & Balancer API server starting')

const app = express()

app.use(cors())
app.use(express.json())

// Заголовки для стабильных запросов к Rutube API
const RUTUBE_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  Referer: 'https://rutube.ru/',
}

// In-memory cache с TTL (в миллисекундах)
const cache = new Map()
const CACHE_TTL_MS = 2 * 60 * 1000 // 2 минуты

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
  // Ограничиваем размер кэша
  if (cache.size > 200) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

// Категории Rutube: официальные ID категорий в Rutube API
const CATEGORY_MAP = {
  default: null, // Популярное / рекомендации
  auto: { id: 2, name: 'Авто' },
  humor: { id: 19, name: 'Юмор' },
  lifehacks: { id: 55, name: 'Лайфхаки' },
  games: { id: 22, name: 'Игры' },
  kino: { id: 4, name: 'Фильмы' },
  series: { id: 5, name: 'Сериалы' },
  cartoons: { id: 7, name: 'Мультфильмы' },
  music: { id: 6, name: 'Музыка' },
  technologies: { id: 45, name: 'Технологии' },
  sport: { id: 16, name: 'Спорт' },
  food: { id: 59, name: 'Еда' },
  science: { id: 52, name: 'Наука' },
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// Список поддерживаемых категорий
app.get('/api/videos/categories', (req, res) => {
  const list = [
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
  res.json(list)
})

// Поиск по видео через Rutube API
async function rutubeSearch(query, page = 1, limit = 24) {
  const cacheKey = `search:${query}:${page}:${limit}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  // Запрос к Rutube с корректным limit и page
  const endpoints = [
    {
      url: `${RUTUBE_API}/search/video/`,
      params: { query, page, limit, format: 'json' },
    },
  ]

  for (const { url, params } of endpoints) {
    try {
      const response = await axios.get(url, {
        params,
        headers: RUTUBE_HEADERS,
        timeout: 8000,
      })
      const data = response.data || {}
      const rawResults = data.results || data.results_list || data.items || data.data || []
      const results = Array.isArray(rawResults)
        ? rawResults.map(toItem).filter((item) => item !== null)
        : []
      const hasNext = Boolean(data.has_next || (results.length >= limit && data.has_next !== false))
      const resultObj = { results, hasNext, page }
      setInCache(cacheKey, resultObj)
      return resultObj
    } catch (e) {
      console.warn(`[Rutube] Search failed for endpoint ${url}:`, e.message)
    }
  }

  return { results: [], hasNext: false, page }
}

// Загрузка категории Rutube по ID
async function rutubeCategory(catId, page = 1, limit = 24) {
  const cacheKey = `category:${catId}:${page}:${limit}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const url = `${RUTUBE_API}/video/category/${catId}/`
    const response = await axios.get(url, {
      params: { page, limit, format: 'json' },
      headers: RUTUBE_HEADERS,
      timeout: 8000,
    })
    const data = response.data || {}
    const rawResults = data.results || []
    const results = Array.isArray(rawResults)
      ? rawResults.map(toItem).filter((item) => item !== null)
      : []
    const hasNext = Boolean(data.has_next || (results.length >= limit && data.has_next !== false))
    const resultObj = { results, hasNext, page }
    setInCache(cacheKey, resultObj)
    return resultObj
  } catch (e) {
    console.warn(`[Rutube] Category ${catId} error:`, e.message)
    return null
  }
}

// Загрузка ленты рекомендаций
async function rutubeTrending(page = 1, limit = 24) {
  const cacheKey = `trending:${page}:${limit}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  // 1. Популярные теги Rutube (Новинки блогеров)
  const tagEndpoints = [
    `${RUTUBE_API}/tags/video/6050/`,
    `${RUTUBE_API}/tags/video/7477/`,
  ]

  for (const url of tagEndpoints) {
    try {
      const response = await axios.get(url, {
        params: { page, limit, format: 'json' },
        headers: RUTUBE_HEADERS,
        timeout: 8000,
      })
      const data = response.data || {}
      const rawResults = data.results || []
      if (Array.isArray(rawResults) && rawResults.length > 0) {
        const results = rawResults.map(toItem).filter((item) => item !== null)
        const hasNext = Boolean(data.has_next || (results.length >= limit && data.has_next !== false))
        const resultObj = { results, hasNext, page }
        setInCache(cacheKey, resultObj)
        return resultObj
      }
    } catch {
      // пробуем следующий
    }
  }

  // 2. Fallback: поиск по слову 'видео' с limit
  return rutubeSearch('видео', page, limit)
}

// Лента видео
app.get('/api/videos/feed', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const category = String(req.query.category || 'default')
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 24))

  try {
    let result
    if (category === 'default' || !CATEGORY_MAP[category]) {
      // Проверяем, может передан числовой ID категории
      const numericCatId = parseInt(category, 10)
      if (Number.isFinite(numericCatId) && numericCatId > 0) {
        result = await rutubeCategory(numericCatId, page, perPage)
      } else {
        result = await rutubeTrending(page, perPage)
      }
    } else {
      const catConfig = CATEGORY_MAP[category]
      result = await rutubeCategory(catConfig.id, page, perPage)
      // Fallback на поиск, если API категории не ответило
      if (!result || result.results.length === 0) {
        result = await rutubeSearch(catConfig.name, page, perPage)
      }
    }

    const items = result ? result.results : []
    const hasNext = result ? result.hasNext : false
    res.json({ items, hasNext, page })
  } catch (error) {
    console.error('[Rutube] Feed error:', error.message)
    res.status(500).json({ error: 'Failed to load feed', details: error.message })
  }
})

// Поиск видео
app.get('/api/videos/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  const perPage = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 24))

  if (!q) return res.status(400).json({ error: 'Missing q parameter' })

  try {
    // Проверяем: если в запросе ссылка на Rutube или 32-значный hex ID видео
    const extractedId = extractRutubeId(q)
    if (extractedId) {
      try {
        const detailRes = await axios.get(`${RUTUBE_API}/video/${extractedId}/`, {
          params: { format: 'json' },
          headers: RUTUBE_HEADERS,
          timeout: 6000,
        })
        const item = toItem(detailRes.data)
        if (item) {
          return res.json({ items: [item], hasNext: false, page: 1 })
        }
      } catch {
        // если по ID не нашли, ищем текстом
      }
    }

    const { results, hasNext } = await rutubeSearch(q, page, perPage)
    res.json({ items: results, hasNext, page })
  } catch (error) {
    console.error('[Rutube] Search error:', error.message)
    res.status(500).json({ error: 'Failed to search videos', details: error.message })
  }
})

// Детальная информация о видео
app.get('/api/videos/detail/:id', async (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'Missing video id' })

  const cacheKey = `detail:${id}`
  const cached = getFromCache(cacheKey)
  if (cached) return res.json(cached)

  try {
    const response = await axios.get(`${RUTUBE_API}/video/${id}/`, {
      params: { format: 'json' },
      headers: RUTUBE_HEADERS,
      timeout: 8000,
    })
    const item = toItem(response.data)
    if (!item) {
      return res.status(404).json({ error: 'Video not found' })
    }
    setInCache(cacheKey, item, 10 * 60 * 1000) // 10 минут
    res.json(item)
  } catch (error) {
    console.error(`[Rutube] Video detail error for ${id}:`, error.message)
    res.status(error.response?.status === 404 ? 404 : 500).json({
      error: 'Failed to get video details',
      details: error.message,
    })
  }
})

// Похожие / рекомендованные видео
app.get('/api/videos/related/:id', async (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'Missing video id' })

  try {
    // Получаем детали видео, чтобы найти похожее по категории или автору
    const detailKey = `detail:${id}`
    let video = getFromCache(detailKey)
    if (!video) {
      const response = await axios.get(`${RUTUBE_API}/video/${id}/`, {
        params: { format: 'json' },
        headers: RUTUBE_HEADERS,
        timeout: 6000,
      })
      video = toItem(response.data)
    }

    let results = []
    if (video?.category?.id) {
      const catRes = await rutubeCategory(video.category.id, 1, 12)
      results = (catRes?.results || []).filter((v) => v.id !== id)
    }
    if (results.length === 0) {
      const trend = await rutubeTrending(1, 12)
      results = (trend?.results || []).filter((v) => v.id !== id)
    }

    res.json({ items: results.slice(0, 12) })
  } catch (error) {
    console.warn(`[Rutube] Related videos error for ${id}:`, error.message)
    res.json({ items: [] })
  }
})

// URL для встраивания плеера Rutube
app.get('/api/videos/embed-url/:id', (req, res) => {
  const id = req.params.id
  if (!id) return res.status(400).json({ error: 'Missing video id' })
  const embedUrl = `https://rutube.ru/play/embed/${id}`
  res.json({ embedUrl })
})

/* ====================================================
 *  HDREZKA API Endpoints
 * ==================================================== */

// Каталог HDRezka (films, series, cartoons, animation, new)
app.get('/api/rezka/feed', async (req, res) => {
  const category = String(req.query.category || 'films')
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  try {
    const data = await hdrezkaService.getFeed(category, page)
    res.json(data)
  } catch (err) {
    console.error('[HDRezka] Feed route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch Rezka feed', details: err.message })
  }
})

// Поиск по каталогу HDRezka
app.get('/api/rezka/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  try {
    const data = await hdrezkaService.search(q, page)
    res.json(data)
  } catch (err) {
    console.error('[HDRezka] Search route error:', err.message)
    res.status(500).json({ error: 'Failed to search Rezka', details: err.message })
  }
})

// Детали фильма / сериала
app.get('/api/rezka/detail', async (req, res) => {
  const urlOrId = String(req.query.url || req.query.id || '').trim()
  if (!urlOrId) return res.status(400).json({ error: 'Missing url or id' })
  try {
    if (urlOrId.startsWith('tmdb_')) {
      const data = await getTmdbDetail(urlOrId)
      return res.json(data)
    }
    const data = await hdrezkaService.getMovieDetail(urlOrId)
    if (!data) return res.status(404).json({ error: 'Movie not found' })
    res.json(data)
  } catch (err) {
    console.error('[Detail] route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch detail', details: err.message })
  }
})

// Поток воспроизведения (качества и субтитры)
app.get('/api/rezka/stream', async (req, res) => {
  const filmId = String(req.query.id || '').trim()
  const translatorId = String(req.query.translator_id || '').trim()
  const season = req.query.season ? String(req.query.season) : undefined
  const episode = req.query.episode ? String(req.query.episode) : undefined
  const isCamrip = req.query.is_camrip ? parseInt(req.query.is_camrip, 10) : 0
  const isAds = req.query.is_ads ? parseInt(req.query.is_ads, 10) : 0
  const isDirector = req.query.is_director ? parseInt(req.query.is_director, 10) : 0
  const favs = req.query.favs ? String(req.query.favs) : ''

  if (!filmId) return res.status(400).json({ error: 'Missing film id' })

  try {
    const data = await hdrezkaService.getStream({
      filmId,
      translatorId,
      season,
      episode,
      isCamrip,
      isAds,
      isDirector,
      favs,
    })
    res.json(data)
  } catch (err) {
    console.error('[HDRezka] Stream route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch stream', details: err.message })
  }
})

// Список серий для выбранного сезона/озвучки
app.get('/api/rezka/episodes', async (req, res) => {
  const filmId = String(req.query.id || '').trim()
  const translatorId = String(req.query.translator_id || '').trim()
  if (!filmId) return res.status(400).json({ error: 'Missing film id' })
  try {
    const data = await hdrezkaService.getEpisodes({ filmId, translatorId })
    res.json(data)
  } catch (err) {
    console.error('[HDRezka] Episodes route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch episodes', details: err.message })
  }
})

// Настройки зеркала и прокси
app.get('/api/rezka/settings', (req, res) => {
  res.json(hdrezkaService.getSettings())
})

app.post('/api/rezka/settings', (req, res) => {
  const { mirrorUrl, proxyUrl } = req.body || {}
  const updated = hdrezkaService.updateSettings({ mirrorUrl, proxyUrl })
  res.json({ success: true, settings: updated })
})

// Проверка доступности зеркала
app.get('/api/rezka/status', async (req, res) => {
  const mirrorUrl = req.query.url ? String(req.query.url) : undefined
  const status = await hdrezkaService.checkMirrorStatus(mirrorUrl)
  res.json(status)
})

/* ====================================================
 *  VIDEO BALANCERS API (Kodik, Collaps, Kinobox, Voidboost)
 * ==================================================== */

// Список доступных источников плеера
app.get('/api/balancer/sources', async (req, res) => {
  const kinopoiskId = req.query.kinopoiskId ? String(req.query.kinopoiskId).trim() : ''
  const imdbId = req.query.imdbId ? String(req.query.imdbId).trim() : ''
  const title = req.query.title ? String(req.query.title).trim() : ''
  const isAnime = req.query.isAnime === 'true' || req.query.isAnime === '1'
  const isSeries = req.query.isSeries === 'true' || req.query.isSeries === '1'

  try {
    const sources = await getBalancerSources({ kinopoiskId, imdbId, title, isAnime, isSeries })
    res.json({ sources })
  } catch (err) {
    console.error('[Balancer] Sources error:', err.message)
    res.status(500).json({ error: 'Failed to resolve balancer sources', details: err.message })
  }
})

// Детальные данные Kodik: озвучки, сезоны, серии
app.get('/api/balancer/kodik', async (req, res) => {
  const kinopoiskId = req.query.kinopoiskId ? String(req.query.kinopoiskId).trim() : ''
  const title = req.query.title ? String(req.query.title).trim() : ''

  try {
    const details = await getKodikDetails({ kinopoiskId, title })
    res.json(details)
  } catch (err) {
    console.error('[Balancer] Kodik error:', err.message)
    res.status(500).json({ error: 'Failed to fetch Kodik details', details: err.message })
  }
})

// Прямой поток HLS (.m3u8) для нативного ТВ-плеера Кинопоиска (без рекламы и без iframe)
app.get('/api/stream/extract', async (req, res) => {
  const kinopoiskId = req.query.kinopoiskId ? String(req.query.kinopoiskId).trim() : ''
  const imdbId = req.query.imdbId ? String(req.query.imdbId).trim() : ''
  const title = req.query.title ? String(req.query.title).trim() : ''
  const season = parseInt(req.query.season, 10) || 1
  const episode = parseInt(req.query.episode, 10) || 1

  try {
    const data = await extractDirectStream({ kinopoiskId, imdbId, title, season, episode })
    res.json(data)
  } catch (err) {
    console.error('[StreamExtractor] Route error:', err.message)
    res.status(500).json({ success: false, error: 'Extraction failed', details: err.message })
  }
})

/**
 * HLS-прокси: проксирует .m3u8 манифесты и .ts/.mp4 сегменты видео через бэкенд,
 * чтобы обойти CORS-ограничения CDN при воспроизведении через hls.js + <video>.
 * Все внутренние URL в манифестах переписываются на /api/hls-proxy для сквозного проксирования.
 */
app.get('/api/hls-proxy', async (req, res) => {
  const targetUrl = req.query.url
  if (!targetUrl || typeof targetUrl !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' })
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Referer': 'https://api.namy.ws/',
        'Origin': 'https://api.namy.ws',
      },
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      console.warn(`[HLS-Proxy] Remote ${response.status} for ${targetUrl.substring(0, 80)}`)
      return res.status(response.status).send('Remote error')
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream'
    const isManifest = targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('m3u8')

    if (isManifest) {
      // Для .m3u8 манифестов: переписываем все URL внутри на прокси
      let text = await response.text()

      // Перезапись аудиодорожек с реальными названиями (дубляж, закадр) и русским DEFAULT=YES
      const rawAudioTracks = req.query.audioTracks
      if (rawAudioTracks && typeof rawAudioTracks === 'string') {
        const audioNames = rawAudioTracks.split('|||').map((s) => s.trim()).filter(Boolean)
        if (audioNames.length > 0) {
          let defaultIdx = audioNames.findIndex((n) =>
            /рус|дубл|голос|сербин|кубик|rezka|lost|hdrezka|глухов|нью|кураж|гоблин/i.test(n)
          )
          if (defaultIdx === -1) defaultIdx = 0

          const lines = text.split('\n')
          const filteredLines = []
          let trackIdx = 0

          for (let i = 0; i < lines.length; i++) {
            let line = lines[i]

            // Убираем дублирующую группу failover-audio-0
            if (line.includes('failover-audio-0')) {
              continue
            }

            if (line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')) {
              if (trackIdx < audioNames.length) {
                const trackName = audioNames[trackIdx]
                const isDef = trackIdx === defaultIdx ? 'YES' : 'NO'
                const lang = /eng|orig/i.test(trackName) ? 'en' : /укр/i.test(trackName) ? 'uk' : 'ru'
                line = line
                  .replace(/NAME="[^"]+"/, `NAME="${trackName}"`)
                  .replace(/DEFAULT=(?:YES|NO)/, `DEFAULT=${isDef}`)
                  .replace(/AUTOSELECT=(?:YES|NO)/, `AUTOSELECT=${isDef}`)
                  .replace(/LANGUAGE="[^"]+"/, `LANGUAGE="${lang}"`)
              }
              trackIdx++
            }

            filteredLines.push(line)
          }
          text = filteredLines.join('\n')
        }
      }

      // Определяем базовый URL манифеста для разрешения относительных путей
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
      const selfOrigin = `${req.protocol}://${req.get('host')}`

      // Переписываем абсолютные URL (https://...)
      text = text.replace(/(https?:\/\/[^\s"']+)/g, (match) => {
        return `${selfOrigin}/api/hls-proxy?url=${encodeURIComponent(match)}`
      })

      // Переписываем относительные URL (не начинающиеся с #, http, или пустые строки)
      text = text.replace(/^(?!#)(?!https?:\/\/)([^\s]+\.(?:m3u8|ts|mp4|key|vtt|srt)[^\s]*)/gm, (match) => {
        const absoluteUrl = new URL(match, baseUrl).href
        return `${selfOrigin}/api/hls-proxy?url=${encodeURIComponent(absoluteUrl)}`
      })

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Cache-Control', 'no-cache')
      return res.send(text)
    }

    // Для бинарных сегментов (.ts, .mp4, .key) — кэшируем и стримим напрямую
    res.setHeader('Content-Type', contentType)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')

    const contentLength = response.headers.get('content-length')
    if (contentLength) res.setHeader('Content-Length', contentLength)

    // Стримим тело ответа напрямую с аппаратной поддержкой backpressure
    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body)
      nodeStream.pipe(res)
      nodeStream.on('error', (err) => {
        console.warn('[HLS-Proxy] Stream error:', err.message)
        if (!res.headersSent) res.status(502).send('Stream error')
        else res.end()
      })
    } else {
      res.end()
    }
  } catch (err) {
    console.warn(`[HLS-Proxy] Fetch error for ${targetUrl.substring(0, 80)}:`, err.message)
    if (!res.headersSent) res.status(502).json({ error: 'HLS proxy error' })
  }
})

/* ====================================================
 *  TMDB API Endpoints (The Movie Database)
 * ==================================================== */

// Каталог фильмов, сериалов, мультфильмов и аниме TMDB
app.get('/api/tmdb/feed', async (req, res) => {
  const category = String(req.query.category || 'films')
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  try {
    const data = await getTmdbFeed(category, page)
    res.json(data)
  } catch (err) {
    console.error('[TMDB] Feed route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch TMDB feed', details: err.message })
  }
})

// Поиск по TMDB
app.get('/api/tmdb/search', async (req, res) => {
  const q = String(req.query.q || '').trim()
  const page = Math.max(1, parseInt(req.query.page, 10) || 1)
  try {
    const data = await searchTmdb(q, page)
    res.json(data)
  } catch (err) {
    console.error('[TMDB] Search route error:', err.message)
    res.status(500).json({ error: 'Failed to search TMDB', details: err.message })
  }
})

// Детали контента TMDB
app.get('/api/tmdb/detail', async (req, res) => {
  const id = String(req.query.id || req.query.tmdbId || '').trim()
  const mediaType = req.query.mediaType ? String(req.query.mediaType).trim() : undefined
  if (!id) return res.status(400).json({ error: 'Missing id' })
  try {
    const data = await getTmdbDetail(id, mediaType)
    res.json(data)
  } catch (err) {
    console.error('[TMDB] Detail route error:', err.message)
    res.status(500).json({ error: 'Failed to fetch TMDB detail', details: err.message })
  }
})

// Image proxy для Smart TV и мобильных устройств (обход блокировок CDN / RKN в локальной сети)
const imageCache = new Map()
const MAX_IMAGE_CACHE = 500

app.get(['/api/image-proxy', '/api/tmdb/image-proxy'], async (req, res) => {
  const imageUrl = req.query.url
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).send('Missing url parameter')
  }

  // Проверяем in-memory cache
  const cached = imageCache.get(imageUrl)
  if (cached && Date.now() < cached.expiresAt) {
    res.setHeader('Content-Type', cached.contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    return res.send(cached.buffer)
  }

  try {
    let response
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3500)
      response = await fetch(imageUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
      })
      clearTimeout(timeoutId)
      if (!response.ok) throw new Error(`Status ${response.status}`)
    } catch {
      // Direct fetch timed out or blocked (e.g. image.tmdb.org) -> fallback to wsrv.nl
      const cleanUrl = imageUrl.replace(/^https?:\/\//, '')
      response = await fetch(`https://wsrv.nl/?url=${cleanUrl}&w=342&output=webp`)
    }

    if (!response.ok) {
      console.warn(`[ImageProxy] Remote status ${response.status} for ${imageUrl}`)
      return res.status(response.status).send('Remote error')
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    if (imageCache.size >= MAX_IMAGE_CACHE) {
      const oldest = imageCache.keys().next().value
      if (oldest) imageCache.delete(oldest)
    }

    imageCache.set(imageUrl, {
      buffer,
      contentType,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 дней
    })

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    return res.send(buffer)
  } catch (err) {
    console.warn(`[ImageProxy] Failed to proxy image ${imageUrl}:`, err.message)
    return res.status(502).send('Error proxying image')
  }
})

/* ====================================================
 *  AUTH & CLOUD SYNC API (Профили, история, избранное)
 * ==================================================== */

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, pin, avatar } = req.body || {}
    const result = authService.register({ username, pin, avatar })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, pin } = req.body || {}
    const result = authService.login({ username, pin })
    res.json({ success: true, ...result })
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
})

app.post('/api/auth/sync', (req, res) => {
  try {
    const { username, history, favorites } = req.body || {}
    const result = authService.sync({ username, history, favorites })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/auth/data', (req, res) => {
  try {
    const username = req.query.username
    const data = authService.getUserData(username)
    if (!data) return res.status(404).json({ error: 'Пользователь не найден' })
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`[server] Televizion Movie & Balancers proxy listening on http://localhost:${PORT}`)
})
