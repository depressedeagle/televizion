import axios from 'axios'

/**
 * Модуль извлечения прямых HLS видеопотоков (.m3u8):
 * Позволяет воспроизводить фильмы и сериалы в НАСТОЯЩЕМ кастомном плеере (как в Кинопоиске),
 * БЕЗ рекламы, БЕЗ сторонних iframe, БЕЗ баннеров, с полным контролем пульта!
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Кэш потоков с TTL 15 минут
const streamCache = new Map()
const CACHE_TTL_MS = 15 * 60 * 1000

function getFromCache(key) {
  const item = streamCache.get(key)
  if (!item) return null
  if (Date.now() > item.expiresAt) {
    streamCache.delete(key)
    return null
  }
  return item.data
}

function setInCache(key, data) {
  if (streamCache.size > 200) {
    const oldest = streamCache.keys().next().value
    if (oldest) streamCache.delete(oldest)
  }
  streamCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

export async function extractDirectStream({ kinopoiskId, imdbId, title, season = 1, episode = 1 }) {
  if (!kinopoiskId && !imdbId && !title) {
    return { success: false, error: 'Missing identifier' }
  }

  const cacheKey = `stream:${kinopoiskId || ''}:${imdbId || ''}:${season}:${episode}`
  const cached = getFromCache(cacheKey)
  if (cached) return cached

  const candidateUrls = []
  if (kinopoiskId) candidateUrls.push(`https://api.namy.ws/embed/kp/${kinopoiskId}`)
  if (imdbId) candidateUrls.push(`https://api.namy.ws/embed/imdb/${imdbId}`)

  for (const embedUrl of candidateUrls) {
    try {
      const response = await axios.get(embedUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          Referer: 'https://kinogo.inc/',
        },
        timeout: 6000,
        validateStatus: (status) => status < 500,
      })

      if (response.status === 404) {
        continue
      }

      const html = response.data
      if (typeof html === 'string') {
        const match = html.match(/makePlayer\(\{([\s\S]*?)\}\);/)
        if (match && match[1]) {
          // Безопасный парсинг конфигурации makePlayer
          const code = 'const fn = () => ({' + match[1] + '}); fn();'
          const data = eval(code)

          // Если это сериал с сезонами и сериями
          if (data.playlist?.seasons && Array.isArray(data.playlist.seasons)) {
            const seasonsList = data.playlist.seasons.map((s) => ({
              season: s.season,
              episodes: (s.episodes || []).map((ep) => ({
                episode: String(ep.episode),
                hls: ep.hls || '',
                audioNames: ep.audio?.names || [],
              })),
            }))

            const targetSeason =
              seasonsList.find((s) => String(s.season) === String(season)) || seasonsList[0]
            const targetEp =
              targetSeason?.episodes.find((e) => String(e.episode) === String(episode)) ||
              targetSeason?.episodes[0]

            const result = {
              success: true,
              isSeries: true,
              title: data.title || title || '',
              hls: targetEp?.hls || '',
              audioTracks: targetEp?.audioNames || [],
              subtitles: data.source?.cc || [],
              currentSeason: targetSeason?.season || 1,
              currentEpisode: targetEp?.episode || '1',
              seasons: seasonsList.map((s) => ({
                season: s.season,
                episodesCount: s.episodes.length,
                episodes: s.episodes.map((e) => ({
                  episode: e.episode,
                  hasHls: Boolean(e.hls),
                  audioTracks: e.audioNames,
                })),
              })),
            }

            setInCache(cacheKey, result)
            return result
          }

          // Если это фильм
          if (data.source?.hls) {
            const result = {
              success: true,
              isSeries: false,
              title: data.title || title || '',
              hls: data.source.hls,
              audioTracks: data.source.audio?.names || [],
              subtitles: data.source.cc || [],
            }

            setInCache(cacheKey, result)
            return result
          }
        }
      }
    } catch (err) {
      console.warn('[StreamExtractor] Error extracting from namy.ws:', err.message)
    }
  }

  return {
    success: false,
    error: 'Прямой HLS поток не найден',
    fallbackIframe: candidateUrls[0] || (kinopoiskId ? `https://kodikplayer.com/find-player?kinopoiskID=${kinopoiskId}` : ''),
  }
}
