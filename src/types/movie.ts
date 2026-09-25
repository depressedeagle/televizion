export interface MovieItem {
  id: string
  title: string
  url: string
  poster: string
  category: string
  quality?: string
  subtitle?: string
  year?: string
  ratingKp?: string
  ratingImdb?: string
  genres?: string
  country?: string
  duration?: string
  description?: string
  isSeries?: boolean
  kinopoiskId?: string
  imdbId?: string
}

export interface Translator {
  id: string
  name: string
  isDefault?: boolean
}

export interface Season {
  id: string
  name: string
}

export interface Episode {
  seasonId: string
  episodeId: string
  name: string
}

export interface MovieDetail extends MovieItem {
  origTitle?: string
  favs?: string
  translators: Translator[]
  seasons?: Season[]
  episodes?: Episode[]
  isFallback?: boolean
}

export interface FeedResponse {
  items: MovieItem[]
  page: number
  hasNext: boolean
  category?: string
  total?: number
  notice?: string | null
}

// Алиасы для обратной совместимости
export type RezkaMovieItem = MovieItem
export type RezkaMovieDetail = MovieDetail
export type RezkaTranslator = Translator
export type RezkaSeason = Season
export type RezkaEpisode = Episode
export type RezkaFeedResponse = FeedResponse
