import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  getEmbedUrl,
  getStoredProgress,
  setStoredProgress,
} from './rutubeApi'

describe('rutubeApi', () => {
  describe('getEmbedUrl', () => {
    it('returns embed URL without start time', () => {
      expect(getEmbedUrl('abc123')).toBe('https://rutube.ru/play/embed/abc123')
    })

    it('returns embed URL with bmstart when startSeconds provided', () => {
      expect(getEmbedUrl('abc123', 120)).toBe('https://rutube.ru/play/embed/abc123?bmstart=120')
    })

    it('returns embed URL with loop when loop is true', () => {
      expect(getEmbedUrl('abc123', undefined, true)).toBe('https://rutube.ru/play/embed/abc123?loop=1')
    })

    it('returns embed URL with both bmstart and loop', () => {
      const url = getEmbedUrl('abc123', 120, true)
      expect(url).toContain('bmstart=120')
      expect(url).toContain('loop=1')
    })

    it('ignores zero or negative startSeconds', () => {
      expect(getEmbedUrl('x', 0)).toBe('https://rutube.ru/play/embed/x')
      expect(getEmbedUrl('x', -1)).toBe('https://rutube.ru/play/embed/x')
    })
  })

  describe('getStoredProgress / setStoredProgress', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        length: 0,
        key: vi.fn(),
      })
    })

    it('returns null when no stored progress', () => {
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null)
      expect(getStoredProgress('vid1')).toBe(null)
    })

    it('returns stored seconds when valid', () => {
      ;(localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue('90')
      expect(getStoredProgress('vid1')).toBe(90)
    })

    it('setStoredProgress writes to localStorage', () => {
      setStoredProgress('vid1', 120)
      expect(localStorage.setItem).toHaveBeenCalledWith('televizion_progress_vid1', '120')
    })
  })
})
