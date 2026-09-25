import axios from 'axios'

const TMDB_API_BASE = 'https://api.themoviedb.org/3'
const TMDB_API_KEY = process.env.TMDB_API_KEY || 'd433b9c6e1e1ae541c2707d670dd7a7e'

// In-memory cache с TTL 10 минут
const cache = new Map()
const CACHE_TTL_MS = 10 * 60 * 1000

function getFromCache(key) {
  const item = cache.get(key)
  if (!item) return null
  if (Date.now() > item.expiresAt) {
    cache.delete(key)
    return null
  }
  return item.data
}

function setInCache(key, data, ttlMs = CACHE_TTL_MS) {
  if (cache.size > 400) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

/**
 * Нормализация постеров под Smart TV (w342 экономит до 95% RAM по сравнению с original)
 */
function getPosterUrl(path, size = 'w342') {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  const clean = path.startsWith('/') ? path : `/${path}`
  return `https://image.tmdb.org/t/p/${size}${clean}`
}

/**
 * Преобразование объекта TMDB в стандартный формат карточки каталога
 */
function mapTmdbToMovieItem(raw, forcedMediaType) {
  const isTv = forcedMediaType ? forcedMediaType === 'tv' : raw.media_type === 'tv' || Boolean(raw.first_air_date)
  const tmdbId = String(raw.id)
  const id = `tmdb_${isTv ? 'tv' : 'movie'}_${tmdbId}`
  const title = raw.title || raw.name || raw.original_title || raw.original_name || 'Без названия'
  const origTitle = raw.original_title || raw.original_name || ''
  const releaseDate = raw.release_date || raw.first_air_date || ''
  const year = releaseDate ? releaseDate.slice(0, 4) : ''
  const rating = raw.vote_average ? Number(raw.vote_average).toFixed(1) : ''

  return {
    id,
    tmdbId,
    mediaType: isTv ? 'tv' : 'movie',
    title,
    origTitle,
    url: `/movie/${id}`,
    poster: getPosterUrl(raw.poster_path, 'w342'),
    year,
    ratingImdb: rating,
    ratingKp: rating,
    description: raw.overview || '',
    isSeries: isTv,
    category: isTv ? 'Сериал' : 'Фильм',
    quality: '1080p Full HD',
  }
}

/**
 * Лента TMDB по категориям (films, series, cartoons, animation, new)
 */
export async function getTmdbFeed(category = 'films', page = 1) {
  const cacheKey = `tmdb:feed:${category}:${page}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  let endpoint = '/discover/movie'
  let params = {
    api_key: TMDB_API_KEY,
    language: 'ru-RU',
    page,
    sort_by: 'popularity.desc',
  }
  let mediaType = 'movie'

  switch (category) {
    case 'series':
      endpoint = '/discover/tv'
      mediaType = 'tv'
      break

    case 'cartoons':
      endpoint = '/discover/movie'
      params.with_genres = '16' // Анимация
      break

    case 'animation': // Аниме
      endpoint = '/discover/tv'
      params.with_genres = '16'
      params.with_original_language = 'ja' // Японская анимация (аниме)
      mediaType = 'tv'
      break

    case 'new':
      endpoint = '/movie/now_playing'
      delete params.sort_by
      break

    case 'films':
    default:
      endpoint = '/discover/movie'
      break
  }

  try {
    const res = await axios.get(`${TMDB_API_BASE}${endpoint}`, {
      params,
      timeout: 7000,
    })

    const results = res.data?.results || []
    const items = results
      .filter((r) => Boolean(r.poster_path))
      .map((r) => mapTmdbToMovieItem(r, mediaType))

    const responseData = {
      items,
      page: Number(res.data?.page || page),
      hasNext: Number(res.data?.page || page) < Number(res.data?.total_pages || 1),
      totalPages: res.data?.total_pages || 1,
      totalResults: res.data?.total_results || 0,
      isFallback: false,
      source: 'tmdb',
    }

    setInCache(cacheKey, responseData)
    return responseData
  } catch (err) {
    console.error(`[TMDB] Feed error for ${category}:`, err.message)
    throw err
  }
}

/**
 * Поиск по каталогу TMDB (фильмы, сериалы, аниме)
 */
export async function searchTmdb(query, page = 1) {
  const q = String(query || '').trim()
  if (!q) return { items: [], page: 1, hasNext: false }

  const cacheKey = `tmdb:search:${q}:${page}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const res = await axios.get(`${TMDB_API_BASE}/search/multi`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'ru-RU',
        query: q,
        page,
        include_adult: false,
      },
      timeout: 7000,
    })

    const results = res.data?.results || []
    const items = results
      .filter((r) => (r.media_type === 'movie' || r.media_type === 'tv') && Boolean(r.poster_path))
      .map((r) => mapTmdbToMovieItem(r, r.media_type))

    const responseData = {
      items,
      page: Number(res.data?.page || page),
      hasNext: Number(res.data?.page || page) < Number(res.data?.total_pages || 1),
      totalPages: res.data?.total_pages || 1,
      totalResults: res.data?.total_results || 0,
      isFallback: false,
      source: 'tmdb',
    }

    setInCache(cacheKey, responseData)
    return responseData
  } catch (err) {
    console.error(`[TMDB] Search error for "${q}":`, err.message)
    throw err
  }
}

/**
 * Детальная информация о фильме или сериале TMDB
 */
export async function getTmdbDetail(idOrTmdbId, mediaTypeHint) {
  const cleanId = String(idOrTmdbId).replace(/^tmdb_(movie|tv)_/, '')
  const isTv = mediaTypeHint === 'tv' || String(idOrTmdbId).includes('tmdb_tv_')
  const endpoint = isTv ? `/tv/${cleanId}` : `/movie/${cleanId}`

  const cacheKey = `tmdb:detail:${isTv ? 'tv' : 'movie'}:${cleanId}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  try {
    const res = await axios.get(`${TMDB_API_BASE}${endpoint}`, {
      params: {
        api_key: TMDB_API_KEY,
        language: 'ru-RU',
        append_to_response: 'external_ids,credits',
      },
      timeout: 8000,
    })

    const data = res.data
    const imdbId = data.external_ids?.imdb_id || ''
    const title = data.title || data.name || data.original_title || data.original_name || 'Без названия'
    const origTitle = data.original_title || data.original_name || ''
    const releaseDate = data.release_date || data.first_air_date || ''
    const year = releaseDate ? releaseDate.slice(0, 4) : ''
    const rating = data.vote_average ? Number(data.vote_average).toFixed(1) : ''
    const genres = (data.genres || []).map((g) => g.name).join(', ')
    const countries = (data.production_countries || []).map((c) => c.name).join(', ')

    // Сезоны и серии
    const seasons = []
    const episodes = []

    if (isTv && Array.isArray(data.seasons)) {
      data.seasons.forEach((s) => {
        if (s.season_number >= 0) {
          seasons.push({
            id: String(s.season_number),
            name: s.name || `Сезон ${s.season_number}`,
          })

          const epCount = s.episode_count || 1
          for (let e = 1; e <= epCount; e++) {
            episodes.push({
              seasonId: String(s.season_number),
              episodeId: String(e),
              name: `Серия ${e}`,
            })
          }
        }
      })
    }

    const detailItem = {
      id: `tmdb_${isTv ? 'tv' : 'movie'}_${cleanId}`,
      tmdbId: cleanId,
      imdbId,
      title,
      origTitle,
      url: `/movie/tmdb_${isTv ? 'tv' : 'movie'}_${cleanId}`,
      poster: getPosterUrl(data.poster_path, 'w500'),
      year,
      ratingKp: rating,
      ratingImdb: rating,
      genres,
      country: countries,
      duration: data.runtime ? `${data.runtime} мин.` : isTv && data.episode_run_time?.[0] ? `${data.episode_run_time[0]} мин.` : '',
      description: data.overview || '',
      isSeries: isTv,
      category: isTv ? 'Сериал' : 'Фильм',
      translators: [
        { id: 'tmdb_rus', name: 'Официальный дубляж / Профессиональный', isDefault: true },
        { id: 'tmdb_orig', name: 'Оригинал (Eng/Orig)' },
      ],
      seasons: seasons.length > 0 ? seasons : undefined,
      episodes: episodes.length > 0 ? episodes : undefined,
    }

    setInCache(cacheKey, detailItem)
    return detailItem
  } catch (err) {
    console.error(`[TMDB] Detail error for ${cleanId}:`, err.message)
    throw err
  }
}
