export interface RezkaQualityParsed {
  quality: string
  hlsUrl: string | null
  mp4Url: string | null
}

export interface RezkaSubtitleParsed {
  lang: string
  label: string
  url: string
}

export interface RezkaCatalogItemParsed {
  id: string
  title: string
  origTitle?: string
  url: string
  poster: string
  year?: string
  entity?: string
  quality?: string
  details?: string
  isSeries?: boolean
}

export interface RezkaTranslatorParsed {
  id: string
  name: string
  isDefault?: boolean
}

export interface RezkaSeasonParsed {
  id: string
  name: string
}

export interface RezkaEpisodeParsed {
  seasonId: string
  episodeId: string
  name: string
}

export interface RezkaMovieDetailParsed {
  id: string
  title: string
  origTitle: string
  poster: string
  description: string
  year: string
  country: string
  genres: string
  duration: string
  ratingKp: string
  ratingImdb: string
  isSeries: boolean
  favs: string
  url: string
  translators: RezkaTranslatorParsed[]
  seasons: RezkaSeasonParsed[]
  episodes: RezkaEpisodeParsed[]
}

export function decodeTrash(data: string): string
export function parsePlaylist(playlistStr: string): RezkaQualityParsed[]
export function parseSubtitles(subStr: string, subLns?: Record<string, string>): RezkaSubtitleParsed[]
export function parseCatalogHtml(html: string, baseUrl?: string): RezkaCatalogItemParsed[]
export function parseMoviePageHtml(html: string, pageUrl: string): RezkaMovieDetailParsed | null
