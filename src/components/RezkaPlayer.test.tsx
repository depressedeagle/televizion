import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { RezkaPlayer, formatQualityLabel } from './RezkaPlayer'
import type { MovieDetail } from '../types/movie'

// Mock external services and utilities
vi.mock('../services/streamApi', () => ({
  extractStream: vi.fn().mockResolvedValue({
    success: true,
    hls: 'https://example.com/stream.m3u8',
    isSeries: false,
    audioTracks: ['Дубляж', 'Оригинал'],
  }),
  getProxiedHlsUrl: vi.fn((url: string) => url),
}))

vi.mock('../services/watchProgress', () => ({
  saveWatchProgress: vi.fn(),
  getWatchProgress: vi.fn().mockReturnValue(null),
  markEpisodeWatched: vi.fn(),
  formatWatchTime: (sec: number) => {
    const s = Math.floor(Math.max(0, sec))
    const m = Math.floor(s / 60)
    const remS = s % 60
    return `${m.toString().padStart(2, '0')}:${remS.toString().padStart(2, '0')}`
  },
}))

vi.mock('../utils/tvBackHandler', () => ({
  pushBackHandler: vi.fn(() => vi.fn()),
}))

vi.mock('../utils/imageOptimizer', () => ({
  getPosterUrlWithFallback: vi.fn(() => 'https://example.com/poster.jpg'),
}))

vi.mock('hls.js', () => {
  return {
    default: class MockHls {
      static isSupported = vi.fn().mockReturnValue(true)
      static Events = {
        MANIFEST_PARSED: 'hlsManifestParsed',
        LEVEL_SWITCHED: 'hlsLevelSwitched',
        ERROR: 'hlsError',
        AUDIO_TRACKS_UPDATED: 'hlsAudioTracksUpdated',
        AUDIO_TRACK_SWITCHED: 'hlsAudioTrackSwitched',
      }
      static ErrorTypes = {
        NETWORK_ERROR: 'networkError',
        MEDIA_ERROR: 'mediaError',
      }
      loadSource = vi.fn()
      attachMedia = vi.fn()
      on = vi.fn()
      destroy = vi.fn()
      currentLevel = -1
      audioTracks = [{ name: 'Дубляж' }]
    },
  }
})

const mockMovie: MovieDetail = {
  id: 'film-123',
  title: 'Тестовый Фильм',
  url: '/films/123.html',
  category: 'Фильм',
  year: '2024',
  poster: 'https://example.com/poster.jpg',
  ratingKp: '8.5',
  genres: 'Фантастика',
  description: 'Описание тестового фильма',
  translators: [{ id: '1', name: 'Дубляж', isDefault: true }],
}

describe('RezkaPlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    window.HTMLMediaElement.prototype.pause = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatQualityLabel', () => {
    it('returns formatted resolution labels correctly', () => {
      expect(formatQualityLabel(1080, 1920)).toBe('1080p Full HD')
      expect(formatQualityLabel(720, 1280)).toBe('720p HD')
      expect(formatQualityLabel(480, 854)).toBe('480p')
      expect(formatQualityLabel(360, 640)).toBe('360p')
      expect(formatQualityLabel(0, 0)).toBe('Авто')
    })
  })

  describe('Fast Seeking on Remote Hold', () => {
    it('switches to watching mode and displays movie controls', async () => {
      render(<RezkaPlayer movie={mockMovie} onBack={vi.fn()} />)
      expect(screen.getByText('Тестовый Фильм')).toBeInTheDocument()

      // Flush microtasks for extractStream
      await act(async () => {
        await Promise.resolve()
      })

      // Click watch button to enter watching mode
      const watchBtn = screen.getByRole('button', { name: /смотреть/i })
      act(() => {
        fireEvent.click(watchBtn)
      })

      // Fast-forward watch state initialization
      act(() => {
        vi.advanceTimersByTime(600)
      })

      // HUD buttons should be present
      expect(screen.getByText('⏪ -10с')).toBeInTheDocument()
      expect(screen.getByText('⏩ +10с')).toBeInTheDocument()
    })

    it('performs single 10s seek on short tap ArrowRight', async () => {
      render(<RezkaPlayer movie={mockMovie} onBack={vi.fn()} />)

      await act(async () => {
        await Promise.resolve()
      })

      const watchBtn = screen.getByRole('button', { name: /смотреть/i })
      act(() => {
        fireEvent.click(watchBtn)
        vi.advanceTimersByTime(600)
      })

      // Tap ArrowRight: keydown and quick keyup (<260ms)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39 }))
      })

      // OSD should show jump +10 сек
      expect(document.querySelector('.kp-osd-pill')).toHaveTextContent(/00:10/i)

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', keyCode: 39 }))
      })

      // Fast seek overlay should not be active since key was released quickly
      expect(document.querySelector('.kp-fast-seek-overlay')).toBeNull()
    })

    it('activates fast seek overlay on held ArrowRight and accelerates', async () => {
      render(<RezkaPlayer movie={mockMovie} onBack={vi.fn()} />)

      await act(async () => {
        await Promise.resolve()
      })

      const watchBtn = screen.getByRole('button', { name: /смотреть/i })
      act(() => {
        fireEvent.click(watchBtn)
        vi.advanceTimersByTime(600)
      })

      // Hold ArrowRight
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39 }))
      })

      // Advance past hold threshold (260ms)
      act(() => {
        vi.advanceTimersByTime(350)
      })

      // Fast seek overlay should now be visible!
      expect(document.querySelector('.kp-fast-seek-overlay')).not.toBeNull()
      expect(screen.getByText('Отпустите кнопку для воспроизведения')).toBeInTheDocument()

      // Advance timers further to test acceleration ticks
      act(() => {
        vi.advanceTimersByTime(1500)
      })

      // Multiplier should increase as button is held longer
      expect(document.querySelector('.kp-fast-seek-speed')).toBeInTheDocument()

      // Release keyup -> overlay clears and seek is committed
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', keyCode: 39 }))
      })

      expect(document.querySelector('.kp-fast-seek-overlay')).toBeNull()
    })

    it('activates fast seek rewind on held ArrowLeft', async () => {
      render(<RezkaPlayer movie={mockMovie} onBack={vi.fn()} />)

      await act(async () => {
        await Promise.resolve()
      })

      const watchBtn = screen.getByRole('button', { name: /смотреть/i })
      act(() => {
        fireEvent.click(watchBtn)
        vi.advanceTimersByTime(600)
      })

      // Hold ArrowLeft
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37 }))
      })

      // Advance past hold threshold (260ms)
      act(() => {
        vi.advanceTimersByTime(350)
      })

      // Fast seek overlay should show rewind icon
      expect(document.querySelector('.kp-fast-seek-overlay')).not.toBeNull()
      expect(screen.getByText('⏪')).toBeInTheDocument()

      // Release key
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowLeft', keyCode: 37 }))
      })

      expect(document.querySelector('.kp-fast-seek-overlay')).toBeNull()
    })

    it('supports on-screen button pointerdown and pointerup for fast seek', async () => {
      render(<RezkaPlayer movie={mockMovie} onBack={vi.fn()} />)

      await act(async () => {
        await Promise.resolve()
      })

      const watchBtn = screen.getByRole('button', { name: /смотреть/i })
      act(() => {
        fireEvent.click(watchBtn)
        vi.advanceTimersByTime(600)
      })

      const ffBtn = screen.getByText('⏩ +10с')

      // Mouse down on button
      act(() => {
        fireEvent.mouseDown(ffBtn)
      })

      // Advance past hold threshold
      act(() => {
        vi.advanceTimersByTime(350)
      })

      expect(document.querySelector('.kp-fast-seek-overlay')).not.toBeNull()

      // Mouse up releases seek
      act(() => {
        fireEvent.mouseUp(ffBtn)
      })

      expect(document.querySelector('.kp-fast-seek-overlay')).toBeNull()
    })
  })
})
