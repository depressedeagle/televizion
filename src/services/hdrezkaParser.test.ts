import { describe, it, expect } from 'vitest'
import {
  decodeTrash,
  parsePlaylist,
  parseSubtitles,
  parseCatalogHtml,
  parseMoviePageHtml,
} from '../../server/hdrezkaParser.mjs'

describe('hdrezkaParser', () => {
  describe('decodeTrash', () => {
    it('returns empty string on empty input', () => {
      expect(decodeTrash('')).toBe('')
      expect(decodeTrash(null as unknown as string)).toBe('')
    })

    it('passes through clean URLs without # prefix', () => {
      expect(decodeTrash('https://example.com/playlist.m3u8')).toBe('https://example.com/playlist.m3u8')
    })

    it('decodes simple base64 encoded URL with #h prefix', () => {
      const raw = 'https://stream.example.com/manifest.m3u8'
      const encoded = '#h' + Buffer.from(raw).toString('base64')
      expect(decodeTrash(encoded)).toBe(raw)
    })

    it('strips trash markers before decoding', () => {
      const raw = 'https://stream.example.com/playlist.m3u8'
      const trash1 = Buffer.from('$$!!@$$@^!@#$$@').toString('base64')
      const encoded = '#h' + '//_//' + trash1 + Buffer.from(raw).toString('base64') + '//_//' + trash1
      expect(decodeTrash(encoded)).toBe(raw)
    })
  })

  describe('parsePlaylist', () => {
    it('parses qualities and sorts from highest to lowest', () => {
      const sample =
        '[480p]https://cdn.example.com/480.mp4,[1080p Ultra]https://cdn.example.com/1080p_ultra.mp4:hls:manifest.m3u8 or https://cdn.example.com/1080p_ultra.mp4,[720p]https://cdn.example.com/720.mp4'
      const parsed = parsePlaylist(sample)
      expect(parsed.length).toBe(3)
      expect(parsed[0].quality).toBe('1080p Ultra')
      expect(parsed[1].quality).toBe('720p')
      expect(parsed[2].quality).toBe('480p')
      expect(parsed[0].hlsUrl).toContain('1080p_ultra.mp4')
      expect(parsed[0].mp4Url).toContain('1080p_ultra.mp4')
    })

    it('handles empty playlist gracefully', () => {
      expect(parsePlaylist('')).toEqual([])
      expect(parsePlaylist('invalid string')).toEqual([])
    })
  })

  describe('parseSubtitles', () => {
    it('parses subtitle tracks with labels', () => {
      const subStr = '[rus]https://cdn.example.com/rus.vtt,[eng]https://cdn.example.com/eng.vtt'
      const subLns = { rus: 'Русский', eng: 'English' }
      const res = parseSubtitles(subStr, subLns)
      expect(res.length).toBe(2)
      expect(res[0]).toEqual({
        lang: 'rus',
        label: 'Русский',
        url: 'https://cdn.example.com/rus.vtt',
      })
      expect(res[1]).toEqual({
        lang: 'eng',
        label: 'English',
        url: 'https://cdn.example.com/eng.vtt',
      })
    })
  })

  describe('parseCatalogHtml', () => {
    it('extracts movie cards from catalog HTML', () => {
      const html = `
        <div class="b-content__inline_item" data-id="12345" data-url="https://rezka.ag/films/12345.html">
          <div class="b-content__inline_item-cover">
            <img src="//static.rezka.ag/poster.jpg" />
            <span class="cat">Фильм</span>
            <i class="entity">1080p</i>
          </div>
          <div class="b-content__inline_item-link">
            <a href="https://rezka.ag/films/12345.html">Интерстеллар</a>
            <div>2014, США, Фантастика</div>
          </div>
        </div>
      `
      const items = parseCatalogHtml(html)
      expect(items.length).toBe(1)
      expect(items[0].id).toBe('12345')
      expect(items[0].title).toBe('Интерстеллар')
      expect(items[0].year).toBe('2014')
      expect(items[0].poster).toBe('https://static.rezka.ag/poster.jpg')
      expect(items[0].quality).toBe('1080p')
    })
  })

  describe('parseMoviePageHtml', () => {
    it('extracts movie details, translators and ratings', () => {
      const html = `
        <div class="b-post__title"><h1>Дюна 2</h1></div>
        <div class="b-post__origtitle">Dune 2</div>
        <div class="b-sidecover"><img src="https://static.rezka.ag/dune.jpg" /></div>
        <div class="b-post__description_text">Описание фильма</div>
        <table class="b-post__info">
          <tr><td>Год:</td><td>2024</td></tr>
          <tr><td>Страна:</td><td>США</td></tr>
          <tr><td>IMDb:</td><td>8.8</td></tr>
          <tr><td>Кинопоиск:</td><td>8.5</td></tr>
        </table>
        <ul id="translators-list">
          <li class="b-translator__item" data-translator_id="56" title="Дубляж">Дубляж</li>
          <li class="b-translator__item" data-translator_id="238" title="HDRezka Studio">HDRezka Studio</li>
        </ul>
        <script>
          sof.tv.initCDNMoviesEvents(71420, 56, 0, 0, 0);
        </script>
      `
      const movie = parseMoviePageHtml(html, 'https://rezka.ag/films/71420.html')
      expect(movie).not.toBeNull()
      expect(movie?.id).toBe('71420')
      expect(movie?.title).toBe('Дюна 2')
      expect(movie?.origTitle).toBe('Dune 2')
      expect(movie?.year).toBe('2024')
      expect(movie?.ratingImdb).toBe('8.8')
      expect(movie?.ratingKp).toBe('8.5')
      expect(movie?.translators.length).toBe(2)
      expect(movie?.translators[0].name).toBe('Дубляж')
      expect(movie?.isSeries).toBe(false)
    })
  })
})
