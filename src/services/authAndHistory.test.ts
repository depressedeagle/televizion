import { describe, it, expect, beforeEach } from 'vitest'
import {
  saveWatchProgress,
  getWatchProgress,
  deleteWatchProgress,
  clearAllWatchProgress,
  getAllWatchProgress,
  formatWatchTime,
} from './watchProgress'
import { authService } from './authService'

describe('Enhanced watchProgress & authService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('deletes watch progress record correctly', () => {
    saveWatchProgress({
      movieId: '123',
      movieTitle: 'Тестовый фильм',
      currentTime: 300,
      duration: 1200,
    })

    expect(getWatchProgress('123')).not.toBeNull()
    deleteWatchProgress('123')
    expect(getWatchProgress('123')).toBeNull()
  })

  it('clears all watch progress correctly', () => {
    saveWatchProgress({ movieId: '1', movieTitle: 'Фильм 1', currentTime: 100 })
    saveWatchProgress({ movieId: '2', movieTitle: 'Фильм 2', currentTime: 200 })
    expect(getAllWatchProgress().length).toBe(2)

    clearAllWatchProgress()
    expect(getAllWatchProgress().length).toBe(0)
  })

  it('formats watch time correctly', () => {
    expect(formatWatchTime(0)).toBe('0:00')
    expect(formatWatchTime(45)).toBe('0:45')
    expect(formatWatchTime(125)).toBe('2:05')
    expect(formatWatchTime(3665)).toBe('1:01:05')
  })

  it('manages user profiles in authService', () => {
    const initial = authService.getActiveProfile()
    expect(initial).not.toBeNull()
    expect(initial.name).toBe('Основной')

    const newProfile = authService.createProfile('Детский', '🧸', '0000')
    expect(newProfile.name).toBe('Детский')
    expect(newProfile.avatar).toBe('🧸')

    const active = authService.getActiveProfile()
    expect(active.id).toBe(newProfile.id)
    expect(active.name).toBe('Детский')

    authService.switchProfile(initial.id)
    expect(authService.getActiveProfile().id).toBe(initial.id)
  })

  it('updates and retrieves server API base', () => {
    authService.setApiBase('https://televizion-api.onrender.com')
    expect(authService.getApiBase()).toBe('https://televizion-api.onrender.com')

    authService.setApiBase('http://192.168.1.100:3001/')
    expect(authService.getApiBase()).toBe('http://192.168.1.100:3001')
  })
})
