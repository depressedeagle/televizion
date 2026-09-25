import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')

// Убеждаемся, что папка данных существует
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
} catch (e) {
  console.warn('[AuthService] Could not create data directory, using memory fallback:', e.message)
}

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const content = fs.readFileSync(USERS_FILE, 'utf-8')
      return JSON.parse(content)
    }
  } catch (e) {
    console.warn('[AuthService] Failed to load users file:', e.message)
  }
  return { users: [] }
}

function saveUsers(data) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.warn('[AuthService] Failed to save users file:', e.message)
  }
}

// In-memory кэш пользователей
let db = loadUsers()

function hashPin(pin) {
  return crypto.createHash('sha256').update(String(pin || '1234')).digest('hex')
}

export const authService = {
  register({ username, pin = '1234', avatar = '👤' }) {
    const cleanUser = String(username || '').trim().toLowerCase()
    if (!cleanUser) {
      throw new Error('Имя пользователя обязательно')
    }

    const existing = db.users.find((u) => u.username.toLowerCase() === cleanUser)
    if (existing) {
      throw new Error('Пользователь с таким именем уже существует')
    }

    const newUser = {
      id: `u_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      username: String(username).trim(),
      pinHash: hashPin(pin),
      avatar,
      history: [],
      favorites: [],
      createdAt: Date.now(),
      lastLogin: Date.now(),
    }

    db.users.push(newUser)
    saveUsers(db)

    return {
      id: newUser.id,
      username: newUser.username,
      avatar: newUser.avatar,
      token: `${newUser.id}_${Date.now()}`,
    }
  },

  login({ username, pin = '1234' }) {
    const cleanUser = String(username || '').trim().toLowerCase()
    const user = db.users.find((u) => u.username.toLowerCase() === cleanUser)

    if (!user) {
      throw new Error('Пользователь не найден')
    }

    if (user.pinHash && user.pinHash !== hashPin(pin)) {
      throw new Error('Неверный PIN-код или пароль')
    }

    user.lastLogin = Date.now()
    saveUsers(db)

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      token: `${user.id}_${Date.now()}`,
      history: user.history || [],
      favorites: user.favorites || [],
    }
  },

  sync({ username, history, favorites }) {
    const cleanUser = String(username || '').trim().toLowerCase()
    const user = db.users.find((u) => u.username.toLowerCase() === cleanUser)

    if (!user) {
      throw new Error('Пользователь не найден для синхронизации')
    }

    if (Array.isArray(history)) {
      user.history = history
    }
    if (Array.isArray(favorites)) {
      user.favorites = favorites
    }

    saveUsers(db)
    return {
      success: true,
      historyCount: (user.history || []).length,
      favoritesCount: (user.favorites || []).length,
    }
  },

  getUserData(username) {
    const cleanUser = String(username || '').trim().toLowerCase()
    const user = db.users.find((u) => u.username.toLowerCase() === cleanUser)
    if (!user) return null

    return {
      id: user.id,
      username: user.username,
      avatar: user.avatar,
      history: user.history || [],
      favorites: user.favorites || [],
    }
  },
}
