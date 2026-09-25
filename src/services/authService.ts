/**
 * Сервис аутентификации и профилей пользователей:
 * - Локальные профили для Smart TV (выбор в 1 клик пультом)
 * - Регистрация и авторизация на сервере с PIN-кодом
 * - Синхронизация истории и избранного
 * - Настройка адреса сервера API прямо из интерфейса ТВ
 */

import { getAllWatchProgress } from './watchProgress'

export interface UserProfile {
  id: string
  name: string
  avatar: string
  pin?: string
  isServerAccount?: boolean
  token?: string
  createdAt: number
}

const STORAGE_PROFILES_KEY = 'televizion_profiles'
const STORAGE_ACTIVE_PROFILE_KEY = 'televizion_active_profile'
const STORAGE_SERVER_URL_KEY = 'televizion_custom_api_url'

export const AVATAR_OPTIONS = ['👤', '🍿', '🎬', '👑', '🐱', '🚀', '⭐', '🔥', '🎮', '🐼', '🦊', '🦁']

const DEFAULT_PROFILE: UserProfile = {
  id: 'default',
  name: 'Основной',
  avatar: '👤',
  createdAt: 1700000000000,
}

function getStoredProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_PROFILES_KEY)
    if (!raw) return [DEFAULT_PROFILE]
    const list = JSON.parse(raw)
    return Array.isArray(list) && list.length > 0 ? list : [DEFAULT_PROFILE]
  } catch {
    return [DEFAULT_PROFILE]
  }
}

function saveStoredProfiles(profiles: UserProfile[]): void {
  try {
    localStorage.setItem(STORAGE_PROFILES_KEY, JSON.stringify(profiles))
  } catch {
    // ignore
  }
}

class AuthService {
  private activeProfile: UserProfile = DEFAULT_PROFILE
  private listeners: Set<(profile: UserProfile) => void> = new Set()

  constructor() {
    this.init()
  }

  private init() {
    try {
      const activeId = localStorage.getItem(STORAGE_ACTIVE_PROFILE_KEY)
      const profiles = getStoredProfiles()
      const found = profiles.find((p) => p.id === activeId)
      this.activeProfile = found || profiles[0] || DEFAULT_PROFILE
    } catch {
      this.activeProfile = DEFAULT_PROFILE
    }
  }

  public getActiveProfile(): UserProfile {
    return this.activeProfile
  }

  public getProfiles(): UserProfile[] {
    return getStoredProfiles()
  }

  public subscribe(cb: (profile: UserProfile) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb(this.activeProfile)
      } catch {
        // ignore
      }
    })
  }

  public switchProfile(profileId: string): UserProfile {
    const profiles = getStoredProfiles()
    const target = profiles.find((p) => p.id === profileId)
    if (target) {
      this.activeProfile = target
      localStorage.setItem(STORAGE_ACTIVE_PROFILE_KEY, target.id)
      this.notify()
    }
    return this.activeProfile
  }

  public createProfile(name: string, avatar = '👤', pin?: string): UserProfile {
    const cleanName = name.trim() || 'Пользователь'
    const profiles = getStoredProfiles()

    const newProfile: UserProfile = {
      id: `profile_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      avatar,
      pin: pin?.trim() || undefined,
      createdAt: Date.now(),
    }

    profiles.push(newProfile)
    saveStoredProfiles(profiles)
    this.switchProfile(newProfile.id)
    return newProfile
  }

  public deleteProfile(profileId: string): boolean {
    if (profileId === 'default') return false
    let profiles = getStoredProfiles()
    profiles = profiles.filter((p) => p.id !== profileId)
    if (profiles.length === 0) {
      profiles = [DEFAULT_PROFILE]
    }
    saveStoredProfiles(profiles)

    if (this.activeProfile.id === profileId) {
      this.switchProfile(profiles[0].id)
    }
    return true
  }

  /**
   * Получить базовый URL API сервера
   */
  public getApiBase(): string {
    const custom = localStorage.getItem(STORAGE_SERVER_URL_KEY)
    if (custom && custom.trim()) return custom.trim().replace(/\/+$/, '')

    if (import.meta.env.VITE_API_BASE) {
      return String(import.meta.env.VITE_API_BASE).replace(/\/+$/, '')
    }

    if (typeof window !== 'undefined' && window.location.origin) {
      const origin = window.location.origin.toLowerCase()
      const isLocalOrNative =
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.startsWith('capacitor:') ||
        origin.startsWith('ionic:') ||
        origin.startsWith('file:')

      if (!isLocalOrNative) {
        return window.location.origin.replace(/\/+$/, '')
      }
    }

    return 'https://televizion.onrender.com'
  }

  /**
   * Сохранить кастомный URL API сервера (например, https://televizion.onrender.com)
   */
  public setApiBase(url: string): void {
    const clean = url.trim().replace(/\/+$/, '')
    if (clean) {
      localStorage.setItem(STORAGE_SERVER_URL_KEY, clean)
    } else {
      localStorage.removeItem(STORAGE_SERVER_URL_KEY)
    }
  }

  /**
   * Регистрация на сервере
   */
  public async registerOnServer(username: string, pin = '1234', avatar = '👤'): Promise<{ success: boolean; message?: string }> {
    try {
      const apiBase = this.getApiBase()
      const res = await fetch(`${apiBase}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin, avatar }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, message: data.error || 'Ошибка регистрации' }
      }

      const profile: UserProfile = {
        id: data.id,
        name: data.username,
        avatar: data.avatar || avatar,
        isServerAccount: true,
        token: data.token,
        createdAt: Date.now(),
      }

      const profiles = getStoredProfiles().filter((p) => p.name !== profile.name)
      profiles.push(profile)
      saveStoredProfiles(profiles)
      this.switchProfile(profile.id)

      return { success: true }
    } catch (e: any) {
      return { success: false, message: e.message || 'Сервер недоступен' }
    }
  }

  /**
   * Вход на сервере
   */
  public async loginOnServer(username: string, pin = '1234'): Promise<{ success: boolean; message?: string }> {
    try {
      const apiBase = this.getApiBase()
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, pin }),
      })
      const data = await res.json()
      if (!res.ok) {
        return { success: false, message: data.error || 'Ошибка входа' }
      }

      const profile: UserProfile = {
        id: data.id,
        name: data.username,
        avatar: data.avatar || '👤',
        isServerAccount: true,
        token: data.token,
        createdAt: Date.now(),
      }

      const profiles = getStoredProfiles().filter((p) => p.name !== profile.name)
      profiles.push(profile)
      saveStoredProfiles(profiles)
      this.switchProfile(profile.id)

      return { success: true }
    } catch (e: any) {
      return { success: false, message: e.message || 'Сервер недоступен' }
    }
  }

  /**
   * Синхронизация данных пользователя с облаком
   */
  public async syncWithServer(): Promise<boolean> {
    if (!this.activeProfile.isServerAccount) return false
    try {
      const apiBase = this.getApiBase()
      const history = getAllWatchProgress()
      const favRaw = localStorage.getItem('televizion_movie_favs')
      const favorites = favRaw ? JSON.parse(favRaw) : []

      const res = await fetch(`${apiBase}/api/auth/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.activeProfile.name,
          history,
          favorites,
        }),
      })
      return res.ok
    } catch {
      return false
    }
  }
}

export const authService = new AuthService()
