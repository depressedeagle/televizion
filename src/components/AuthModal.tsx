import { useState, useEffect } from 'react'
import { authService, AVATAR_OPTIONS, type UserProfile } from '../services/authService'
import './AuthModal.css'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([])
  const [activeProfile, setActiveProfile] = useState<UserProfile>(authService.getActiveProfile())
  const [tab, setTab] = useState<'profiles' | 'create' | 'server'>('profiles')

  // Форма нового профиля
  const [newName, setNewName] = useState('')
  const [newAvatar, setNewAvatar] = useState('👤')
  const [newPin, setNewPin] = useState('')
  const [isServerLogin, setIsServerLogin] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authSuccess, setAuthSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Настройка сервера
  const [serverUrl, setServerUrl] = useState(authService.getApiBase())
  const [serverCheckStatus, setServerCheckStatus] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setProfiles(authService.getProfiles())
      setActiveProfile(authService.getActiveProfile())
      setServerUrl(authService.getApiBase())
      setAuthError(null)
      setAuthSuccess(null)
      setServerCheckStatus(null)
    }
  }, [isOpen])

  // Закрытие по Escape / Back
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace' || e.keyCode === 10009 || e.keyCode === 461) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSelectProfile = (p: UserProfile) => {
    authService.switchProfile(p.id)
    setActiveProfile(p)
    setAuthSuccess(`Вы вошли как ${p.name}`)
    setTimeout(() => {
      onClose()
    }, 700)
  }

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthSuccess(null)

    if (!newName.trim()) {
      setAuthError('Введите имя профиля')
      return
    }

    setLoading(true)
    try {
      if (isServerLogin) {
        const res = await authService.registerOnServer(newName, newPin || '1234', newAvatar)
        if (!res.success) {
          // Попробуем залогиниться, если уже существует
          const loginRes = await authService.loginOnServer(newName, newPin || '1234')
          if (!loginRes.success) {
            setAuthError(res.message || 'Ошибка регистрации/входа на сервере')
            setLoading(false)
            return
          }
        }
      } else {
        authService.createProfile(newName, newAvatar, newPin)
      }

      setProfiles(authService.getProfiles())
      setActiveProfile(authService.getActiveProfile())
      setAuthSuccess('Профиль успешно активирован!')
      setNewName('')
      setNewPin('')
      setTimeout(() => {
        onClose()
      }, 800)
    } catch (err: any) {
      setAuthError(err.message || 'Ошибка создания')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveServerUrl = () => {
    authService.setApiBase(serverUrl)
    setServerCheckStatus('Адрес сервера сохранён!')
    setTimeout(() => setServerCheckStatus(null), 2500)
  }

  const handleCheckServer = async () => {
    setServerCheckStatus('Проверка подключения…')
    try {
      const clean = serverUrl.trim().replace(/\/+$/, '')
      const res = await fetch(`${clean}/health`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        setServerCheckStatus('✅ Сервер доступен и работает отлично!')
      } else {
        setServerCheckStatus(`⚠️ Сервер ответил кодом ${res.status}`)
      }
    } catch (e: any) {
      setServerCheckStatus(`❌ Сервер недоступен: ${e.message || 'таймаут'}`)
    }
  }

  return (
    <div className="auth-modal-backdrop" onClick={onClose}>
      <div className="auth-modal-window" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        {/* Заголовок */}
        <header className="auth-modal-header">
          <div className="auth-modal-title-wrap">
            <span className="auth-modal-icon">👤</span>
            <div>
              <h2 className="auth-modal-title">Профиль и Настройки</h2>
              <p className="auth-modal-subtitle">
                Текущий пользователь: <strong>{activeProfile.avatar} {activeProfile.name}</strong>
              </p>
            </div>
          </div>
          <button type="button" className="auth-modal-close" onClick={onClose} aria-label="Закрыть (Esc)">
            ✕
          </button>
        </header>

        {/* Навигация по вкладкам */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'profiles'}
            className={`auth-tab-btn ${tab === 'profiles' ? 'auth-tab-btn--active' : ''}`}
            onClick={() => setTab('profiles')}
          >
            👥 Выбор профиля
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'create'}
            className={`auth-tab-btn ${tab === 'create' ? 'auth-tab-btn--active' : ''}`}
            onClick={() => setTab('create')}
          >
            ➕ Новый профиль
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'server'}
            className={`auth-tab-btn ${tab === 'server' ? 'auth-tab-btn--active' : ''}`}
            onClick={() => setTab('server')}
          >
            🌐 Сервер API
          </button>
        </div>

        {/* Содержимое вкладок */}
        <div className="auth-modal-body">
          {authError && <div className="auth-banner auth-banner--error">{authError}</div>}
          {authSuccess && <div className="auth-banner auth-banner--success">{authSuccess}</div>}

          {/* ВКЛАДКА 1: Выбор профиля */}
          {tab === 'profiles' && (
            <div className="auth-profiles-view">
              <p className="auth-section-desc">Выберите профиль для раздельного сохранения истории и избранного:</p>
              <div className="auth-profiles-grid">
                {profiles.map((p) => {
                  const isActive = p.id === activeProfile.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`auth-profile-card ${isActive ? 'auth-profile-card--active' : ''}`}
                      onClick={() => handleSelectProfile(p)}
                    >
                      <span className="auth-profile-avatar">{p.avatar}</span>
                      <span className="auth-profile-name">{p.name}</span>
                      {isActive && <span className="auth-profile-badge">Активен ✓</span>}
                      {p.isServerAccount && <span className="auth-profile-cloud-badge">☁️ Облако</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* ВКЛАДКА 2: Создать профиль / Войти */}
          {tab === 'create' && (
            <form className="auth-create-form" onSubmit={handleCreateProfile}>
              <div className="auth-form-field">
                <label className="auth-label">Имя профиля:</label>
                <input
                  type="text"
                  className="auth-input"
                  placeholder="Например: Иван, Дети, Гостиная…"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="auth-form-field">
                <label className="auth-label">Выберите аватар:</label>
                <div className="auth-avatars-row">
                  {AVATAR_OPTIONS.map((av) => (
                    <button
                      key={av}
                      type="button"
                      className={`auth-avatar-pick ${newAvatar === av ? 'auth-avatar-pick--selected' : ''}`}
                      onClick={() => setNewAvatar(av)}
                    >
                      {av}
                    </button>
                  ))}
                </div>
              </div>

              <div className="auth-form-field">
                <label className="auth-label">PIN-код (по желанию, для ТВ пульта):</label>
                <input
                  type="password"
                  maxLength={6}
                  className="auth-input auth-input--pin"
                  placeholder="1234"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                />
              </div>

              <div className="auth-form-checkbox">
                <label className="auth-checkbox-label">
                  <input
                    type="checkbox"
                    checked={isServerLogin}
                    onChange={(e) => setIsServerLogin(e.target.checked)}
                  />
                  <span>Синхронизировать аккаунт с сервером (облачная история)</span>
                </label>
              </div>

              <div className="auth-form-actions">
                <button type="submit" className="auth-submit-btn" disabled={loading}>
                  {loading ? 'Создание…' : '✓ Сохранить и войти'}
                </button>
              </div>
            </form>
          )}

          {/* ВКЛАДКА 3: Сервер API */}
          {tab === 'server' && (
            <div className="auth-server-view">
              <p className="auth-section-desc">
                Адрес бэкенда для парсинга Rutube, HDRezka и балансеров. Если развернули сервер на <strong>Render</strong>, вставьте полученный HTTPS-адрес сюда:
              </p>

              <div className="auth-form-field">
                <label className="auth-label">Базовый URL сервера:</label>
                <input
                  type="url"
                  className="auth-input auth-input--mono"
                  placeholder="https://televizion-api.onrender.com или http://192.168.1.50:3001"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                />
              </div>

              {serverCheckStatus && (
                <div className={`auth-server-status ${serverCheckStatus.startsWith('✅') ? 'auth-server-status--ok' : 'auth-server-status--warn'}`}>
                  {serverCheckStatus}
                </div>
              )}

              <div className="auth-server-actions">
                <button type="button" className="auth-btn auth-btn--primary" onClick={handleSaveServerUrl}>
                  💾 Сохранить адрес
                </button>
                <button type="button" className="auth-btn auth-btn--secondary" onClick={handleCheckServer}>
                  🔌 Проверить связь
                </button>
                <button
                  type="button"
                  className="auth-btn auth-btn--outline"
                  onClick={() => {
                    authService.setApiBase('')
                    const defaultUrl = authService.getApiBase()
                    setServerUrl(defaultUrl)
                    setServerCheckStatus(`Сброшено: ${defaultUrl}`)
                  }}
                >
                  Сброс по умолчанию
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
