import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveWatchProgress,
  getWatchProgress,
  markEpisodeWatched,
  isEpisodeWatched,
  getAllWatchProgress,
} from './watchProgress'
import { getOptimizedPosterUrl } from '../utils/imageOptimizer'

describe('watchProgress service', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saves and retrieves watch progress for movie', () => {
    saveWatchProgress({
      movieId: '4447385',
      movieTitle: 'Дюна: Часть вторая',
      currentTime: 1200,
      duration: 9960,
    })

    const record = getWatchProgress('4447385')
    expect(record).not.toBeNull()
    expect(record?.movieTitle).toBe('Дюна: Часть вторая')
    expect(record?.currentTime).toBe(1200)
    expect(record?.duration).toBe(9960)
    expect(record?.isSeries).toBe(false)
  })

  it('saves and retrieves series progress with season and episode', () => {
    saveWatchProgress({
      movieId: '749377',
      movieTitle: 'Атака титанов',
      isSeries: true,
      season: '2',
      episode: '5',
      currentTime: 450,
      duration: 1400,
    })

    const record = getWatchProgress('749377')
    expect(record?.season).toBe('2')
    expect(record?.episode).toBe('5')
    expect(record?.isSeries).toBe(true)
  })

  it('marks and checks watched episodes correctly', () => {
    expect(isEpisodeWatched('749377', 1, 1)).toBe(false)

    markEpisodeWatched('749377', 1, 1)
    expect(isEpisodeWatched('749377', 1, 1)).toBe(true)
    expect(isEpisodeWatched('749377', 1, 2)).toBe(false)
  })

  it('lists all watch progress entries sorted by updatedAt', () => {
    saveWatchProgress({
      movieId: '1',
      movieTitle: 'Film 1',
      currentTime: 10,
    })
    saveWatchProgress({
      movieId: '2',
      movieTitle: 'Film 2',
      currentTime: 20,
    })

    const list = getAllWatchProgress()
    expect(list.length).toBe(2)
  })
})

describe('imageOptimizer utility', () => {
  it('resizes unsplash urls to target width for 1GB RAM Smart TV', () => {
    const original = 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1600&auto=format&fit=crop&q=80'
    const optimized = getOptimizedPosterUrl(original, 360)
    expect(optimized).toContain('w=360')
    expect(optimized).toContain('q=75')
  })

  it('replaces high-res orig Kinopoisk image suffix with 360x540', () => {
    const original = 'https://avatars.mds.yandex.net/get-kinopoisk-image/12345/abcde/orig'
    const optimized = getOptimizedPosterUrl(original)
    expect(optimized).toBe('https://avatars.mds.yandex.net/get-kinopoisk-image/12345/abcde/360x540')
  })

  it('resizes TMDB image URLs to w342 for Smart TV 1GB RAM', () => {
    const original = 'https://image.tmdb.org/t/p/original/pK8CH9JxrgX2ZIq3WclTwnX0cCL.jpg'
    const optimized = getOptimizedPosterUrl(original, 360)
    expect(optimized).toBe('https://image.tmdb.org/t/p/w342/pK8CH9JxrgX2ZIq3WclTwnX0cCL.jpg')
  })

  it('handles empty or undefined urls safely', () => {
    expect(getOptimizedPosterUrl(undefined)).toBe('')
    expect(getOptimizedPosterUrl('')).toBe('')
  })
})
