import { describe, it, expect } from 'vitest'
import {
  decodeHtmlEntities,
  parseDuration,
  extractRutubeId,
  formatViews,
  normalizeThumbnailUrl,
} from './rutubeParser'

describe('rutubeParser', () => {
  describe('decodeHtmlEntities', () => {
    it('decodes standard HTML entities', () => {
      expect(decodeHtmlEntities('&quot;Шоу&quot; &amp; &laquo;Кино&raquo;')).toBe('"Шоу" & «Кино»')
      expect(decodeHtmlEntities('&#39;hello&#39; &lt;tag&gt;')).toBe("'hello' <tag>")
      expect(decodeHtmlEntities('&ndash; &mdash; &hellip; &nbsp;')).toBe('– — …')
    })

    it('decodes numeric and hex unicode entities', () => {
      expect(decodeHtmlEntities('&#169; 2026 &#x27;test&#x27;')).toBe("© 2026 'test'")
    })

    it('handles empty or non-string inputs safely', () => {
      expect(decodeHtmlEntities(null)).toBe('')
      expect(decodeHtmlEntities(undefined)).toBe('')
      expect(decodeHtmlEntities('')).toBe('')
      expect(decodeHtmlEntities(123)).toBe('')
    })
  })

  describe('parseDuration', () => {
    it('parses seconds as numbers', () => {
      expect(parseDuration(45)).toEqual({ seconds: 45, formatted: '0:45' })
      expect(parseDuration(125)).toEqual({ seconds: 125, formatted: '2:05' })
      expect(parseDuration(3665)).toEqual({ seconds: 3665, formatted: '1:01:05' })
    })

    it('parses duration strings', () => {
      expect(parseDuration('120')).toEqual({ seconds: 120, formatted: '2:00' })
      expect(parseDuration('05:30')).toEqual({ seconds: 330, formatted: '5:30' })
      expect(parseDuration('01:15:00')).toEqual({ seconds: 4500, formatted: '1:15:00' })
    })

    it('parses ISO 8601 durations', () => {
      expect(parseDuration('PT45S')).toEqual({ seconds: 45, formatted: '0:45' })
      expect(parseDuration('PT1M30S')).toEqual({ seconds: 90, formatted: '1:30' })
      expect(parseDuration('PT2H5M10S')).toEqual({ seconds: 7510, formatted: '2:05:10' })
    })

    it('handles invalid duration gracefully', () => {
      expect(parseDuration(null)).toEqual({ seconds: undefined, formatted: undefined })
      expect(parseDuration('invalid')).toEqual({ seconds: undefined, formatted: undefined })
      expect(parseDuration(-10)).toEqual({ seconds: undefined, formatted: undefined })
    })
  })

  describe('extractRutubeId', () => {
    it('extracts direct 32-char hex ID', () => {
      expect(extractRutubeId('cd6bd23c8e8497f193eab77b05ff0bb1')).toBe('cd6bd23c8e8497f193eab77b05ff0bb1')
    })

    it('extracts ID from rutube.ru/video URL', () => {
      expect(
        extractRutubeId('https://rutube.ru/video/cd6bd23c8e8497f193eab77b05ff0bb1/?pl_id=123')
      ).toBe('cd6bd23c8e8497f193eab77b05ff0bb1')
    })

    it('extracts ID from embed and shorts URLs', () => {
      expect(
        extractRutubeId('https://rutube.ru/play/embed/cd6bd23c8e8497f193eab77b05ff0bb1')
      ).toBe('cd6bd23c8e8497f193eab77b05ff0bb1')
      expect(
        extractRutubeId('https://rutube.ru/shorts/cd6bd23c8e8497f193eab77b05ff0bb1/')
      ).toBe('cd6bd23c8e8497f193eab77b05ff0bb1')
    })

    it('returns null for non-rutube or invalid inputs', () => {
      expect(extractRutubeId('https://youtube.com/watch?v=123')).toBe(null)
      expect(extractRutubeId('просто поисковый запрос')).toBe(null)
      expect(extractRutubeId(null)).toBe(null)
    })
  })

  describe('formatViews', () => {
    it('formats view counts appropriately in Russian', () => {
      expect(formatViews(500)).toBe('500 просмотров')
      expect(formatViews(1500)).toBe('1.5 тыс. просмотров')
      expect(formatViews(20000)).toBe('20 тыс. просмотров')
      expect(formatViews(1400000)).toBe('1.4 млн просмотров')
      expect(formatViews(0)).toBe('')
    })
  })

  describe('normalizeThumbnailUrl', () => {
    it('upgrades http to https and protocol-relative urls', () => {
      expect(normalizeThumbnailUrl('http://pic.rtbcdn.ru/image.jpg')).toBe('https://pic.rtbcdn.ru/image.jpg')
      expect(normalizeThumbnailUrl('//pic.rtbcdn.ru/image.jpg')).toBe('https://pic.rtbcdn.ru/image.jpg')
      expect(normalizeThumbnailUrl('https://pic.rtbcdn.ru/image.jpg')).toBe('https://pic.rtbcdn.ru/image.jpg')
    })

    it('rejects invalid or empty urls', () => {
      expect(normalizeThumbnailUrl('')).toBe(undefined)
      expect(normalizeThumbnailUrl(null)).toBe(undefined)
    })
  })
})
