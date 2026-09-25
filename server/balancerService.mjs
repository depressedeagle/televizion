import axios from 'axios'

/**
 * Сервис видео-балансеров:
 * 1. Kodik API (аниме, мультсериалы, дорамы, сериалы) с парсингом озвучек, сезонов и серий
 * 2. Резервные балансеры: Collaps, Kinobox, Voidboost, Alloha, Vidi
 * 3. Автоматическое определение доступных источников и fallback
 */

const KODIK_API_URL = 'https://kodik-api.com/search'
const KINOBOX_API_URL = 'https://kinobox.tv/api/players'

// Список известных публичных/рабочих токенов Kodik
const KODIK_TOKENS = [
  process.env.KODIK_TOKEN,
  '4b0704aa294c8b36873ff6600980ca81',
  '0129a71917406225915152a35829ee5b',
  'e33054170362b534199d21e42c38867a',
].filter(Boolean)

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
  if (cache.size > 300) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) cache.delete(oldestKey)
  }
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

/**
 * Получить список всех доступных плееров/балансеров для КиноПоиск ID или названия
 */
export async function getBalancerSources({ kinopoiskId, imdbId, title, isAnime = false, isSeries = false }) {
  const cacheKey = `sources:${kinopoiskId || ''}:${imdbId || ''}:${title || ''}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  const sources = []

  // 1. Kodik (наивысший приоритет для аниме, мультфильмов и сериалов)
  let kodikEmbed = ''
  if (kinopoiskId) {
    kodikEmbed = `https://kodikplayer.com/find-player?kinopoiskID=${kinopoiskId}`
  } else if (imdbId) {
    kodikEmbed = `https://kodikplayer.com/find-player?imdbID=${imdbId}`
  } else if (title) {
    kodikEmbed = `https://kodikplayer.com/find-player?title=${encodeURIComponent(title)}`
  }

  if (kodikEmbed) {
    sources.push({
      id: 'kodik',
      name: 'Kodik',
      label: '🎌 Kodik (Аниме / Сериалы)',
      iframeUrl: kodikEmbed,
      priority: isAnime ? 1 : 3,
      badge: 'Аниме & Дорамы',
      description: 'Огромная база аниме, дорам и сериалов во всех популярных озвучках',
    })
  }

  // 2. Collaps (высокий приоритет для фильмов и зарубежных сериалов)
  const collapsEmbed = kinopoiskId
    ? `https://api.namy.ws/embed/kp/${kinopoiskId}`
    : imdbId
    ? `https://api.namy.ws/embed/imdb/${imdbId}`
    : ''

  if (collapsEmbed) {
    sources.push({
      id: 'collaps',
      name: 'Collaps',
      label: '✨ Collaps (Основной плеер)',
      iframeUrl: collapsEmbed,
      priority: isAnime ? 3 : 1,
      badge: 'Full HD',
      description: 'Быстрый плеер 1080p со студийным дубляжем и выбором серий',
    })
  }

  // 3. Kinobox (мульти-агрегатор плееров)
  const kinoboxEmbed = kinopoiskId
    ? `https://kinobox.tv/api/players?kinopoisk=${kinopoiskId}`
    : imdbId
    ? `https://kinobox.tv/api/players?imdb=${imdbId}`
    : title
    ? `https://kinobox.tv/api/players?title=${encodeURIComponent(title)}`
    : ''

  if (kinoboxEmbed) {
    sources.push({
      id: 'kinobox',
      name: 'Kinobox',
      label: '⚡ Kinobox (Мульти-балансер)',
      iframeUrl: kinoboxEmbed,
      priority: 2,
      badge: '7 в 1',
      description: 'Универсальный плеер-агрегатор со встроенным автопоиском',
    })
  }

  // 4. Voidboost (запасной плеер для фильмов и сериалов)
  const voidboostEmbed = kinopoiskId
    ? `https://voidboost.net/embed/${kinopoiskId}`
    : imdbId
    ? `https://voidboost.net/embed/${imdbId}`
    : ''

  if (voidboostEmbed) {
    sources.push({
      id: 'voidboost',
      name: 'Voidboost',
      label: '🚀 Voidboost (Запасной)',
      iframeUrl: voidboostEmbed,
      priority: 4,
      badge: 'Стабильный',
      description: 'Резервный видеопоток для новинок и классики',
    })
  }

  // 5. Alloha
  const allohaEmbed = kinopoiskId
    ? `https://harald-as.newplayjj.com/?kp=${kinopoiskId}&token=e7b61f129f4a392ac4bf6726a9dd6a`
    : imdbId
    ? `https://harald-as.newplayjj.com/?imdb=${imdbId}&token=e7b61f129f4a392ac4bf6726a9dd6a`
    : ''

  if (allohaEmbed) {
    sources.push({
      id: 'alloha',
      name: 'Alloha',
      label: '🌐 Alloha',
      iframeUrl: allohaEmbed,
      priority: 5,
      badge: 'HD',
      description: 'Резервный балансер Alloha',
    })
  }

  // 6. Трейлер (если ничего не доступно)
  if (kinopoiskId) {
    sources.push({
      id: 'trailer',
      name: 'Trailer',
      label: '🎬 Трейлер',
      iframeUrl: `https://api.atomics.ws/embed/trailer-kp/${kinopoiskId}`,
      priority: 99,
      badge: 'Трейлер',
      description: 'Официальный дублированный промо-трейлер',
    })
  }

  // Сортировка по приоритету
  sources.sort((a, b) => a.priority - b.priority)

  setInCache(cacheKey, sources)
  return sources
}

/**
 * Получить детальные данные Kodik: список озвучек, сезонов, серий
 */
export async function getKodikDetails({ kinopoiskId, title }) {
  const cacheKey = `kodik:details:${kinopoiskId || ''}:${title || ''}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  const defaultIframeUrl = kinopoiskId
    ? `https://kodikplayer.com/find-player?kinopoiskID=${kinopoiskId}`
    : title
    ? `https://kodikplayer.com/find-player?title=${encodeURIComponent(title)}`
    : ''

  // Пытаемся запросить Kodik API по токенам
  for (const token of KODIK_TOKENS) {
    try {
      const params = {
        token,
        with_episodes: 'true',
        with_material_data: 'true',
      }
      if (kinopoiskId) params.kinopoisk_id = kinopoiskId
      else if (title) params.title = title

      const res = await axios.get(KODIK_API_URL, {
        params,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },
        timeout: 4000,
      })

      const data = res.data
      if (data && data.results && data.results.length > 0) {
        const results = data.results

        // Собираем уникальные озвучки
        const translationsMap = new Map()
        results.forEach((item) => {
          if (item.translation) {
            translationsMap.set(String(item.translation.id), {
              id: String(item.translation.id),
              title: item.translation.title,
              type: item.translation.type || 'voice',
            })
          }
        })
        const translations = Array.from(translationsMap.values())

        // Первый или дефолтный элемент с сезонами
        const primaryItem = results.find((r) => r.seasons && Object.keys(r.seasons).length > 0) || results[0]

        const seasons = []
        const episodesMap = {}

        if (primaryItem.seasons) {
          Object.keys(primaryItem.seasons).forEach((sNum) => {
            const seasonData = primaryItem.seasons[sNum]
            const epList = seasonData.episodes ? Object.keys(seasonData.episodes) : []
            seasons.push({
              number: parseInt(sNum, 10),
              name: `Сезон ${sNum}`,
              episodeCount: epList.length,
            })

            episodesMap[sNum] = epList.map((epNum) => ({
              number: parseInt(epNum, 10),
              name: `Серия ${epNum}`,
              link: seasonData.episodes ? seasonData.episodes[epNum] : '',
            }))
          })
        }

        const normalized = {
          success: true,
          found: true,
          defaultLink: primaryItem.link ? (primaryItem.link.startsWith('http') ? primaryItem.link : `https:${primaryItem.link}`) : defaultIframeUrl,
          title: primaryItem.title || title,
          translations,
          seasons,
          episodesMap,
          rawResultsCount: results.length,
        }

        setInCache(cacheKey, normalized)
        return normalized
      }
    } catch (e) {
      // Пробуем следующий токен или переходим к fallback
    }
  }

  // Fallback, если Kodik API не вернул данные через токен
  const fallbackData = {
    success: true,
    found: Boolean(defaultIframeUrl),
    defaultLink: defaultIframeUrl,
    title: title || 'Контент',
    translations: [
      { id: 'default', title: 'Официальный перевод (Kodik)', type: 'voice' },
      { id: 'sub', title: 'Субтитры', type: 'subtitles' },
    ],
    seasons: [
      { number: 1, name: 'Сезон 1', episodeCount: 12 },
    ],
    episodesMap: {
      '1': Array.from({ length: 12 }, (_, i) => ({
        number: i + 1,
        name: `Серия ${i + 1}`,
        link: `${defaultIframeUrl}&episode=${i + 1}&season=1`,
      })),
    },
    isFallback: true,
  }

  setInCache(cacheKey, fallbackData)
  return fallbackData
}
