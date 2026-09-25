import { useState, useEffect } from 'react'
import {
  fetchRezkaSettings,
  updateRezkaSettings,
  checkRezkaStatus,
  type RezkaStatusResponse,
} from '../services/hdrezkaApi'
import './RezkaSettingsModal.css'

interface RezkaSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave?: () => void
}

export function RezkaSettingsModal({ isOpen, onClose, onSave }: RezkaSettingsModalProps) {
  const [mirrorUrl, setMirrorUrl] = useState('')
  const [proxyUrl, setProxyUrl] = useState('')
  const [status, setStatus] = useState<RezkaStatusResponse | null>(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    fetchRezkaSettings().then((s) => {
      setMirrorUrl(s.mirrorUrl || 'https://rezka.ag')
      setProxyUrl(s.proxyUrl || '')
    })
  }, [isOpen])

  // ESC to close
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const testConnection = async () => {
    setTesting(true)
    setStatus(null)
    setMsg(null)
    try {
      const res = await checkRezkaStatus(mirrorUrl)
      setStatus(res)
    } catch (e) {
      setStatus({
        ok: false,
        mirror: mirrorUrl,
        message: 'Ошибка при проверке соединения',
      })
    } finally {
      setTesting(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    setMsg(null)
    try {
      await updateRezkaSettings({ mirrorUrl, proxyUrl })
      setMsg('Настройки сохранены!')
      setTimeout(() => {
        onSave?.()
        onClose()
      }, 1000)
    } catch {
      setMsg('Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="rezka-modal-backdrop" onClick={onClose}>
      <div className="rezka-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="rezka-modal__header">
          <h2>⚙️ Настройки зеркала HDRezka</h2>
          <button type="button" className="rezka-modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="rezka-modal__body">
          <div className="rezka-field">
            <label htmlFor="rezka-mirror-input">Адрес зеркала HDRezka:</label>
            <input
              id="rezka-mirror-input"
              type="url"
              className="rezka-input"
              placeholder="https://rezka.ag"
              value={mirrorUrl}
              onChange={(e) => setMirrorUrl(e.target.value)}
            />
            <p className="rezka-field-hint">
              💡 Если зеркало заблокировано, отправьте пустое письмо на{' '}
              <strong>mirror@hdrezka.org</strong> и укажите полученную ссылку здесь.
            </p>
          </div>

          <div className="rezka-field">
            <label htmlFor="rezka-proxy-input">Прокси (опционально):</label>
            <input
              id="rezka-proxy-input"
              type="text"
              className="rezka-input"
              placeholder="например https://corsproxy.io/?url="
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
            />
            <p className="rezka-field-hint">
              Используется при необходимости обхода блокировок интернет-провайдера.
            </p>
          </div>

          {status && (
            <div className={`rezka-status-box ${status.ok ? 'rezka-status-box--ok' : 'rezka-status-box--err'}`}>
              <strong>{status.ok ? '🟢 Подключено' : '🔴 Недоступно'}:</strong> {status.message}
            </div>
          )}

          {msg && <div className="rezka-save-msg">{msg}</div>}
        </div>

        <div className="rezka-modal__footer">
          <button
            type="button"
            className="rezka-btn rezka-btn--test"
            disabled={testing}
            onClick={testConnection}
          >
            {testing ? 'Проверка…' : 'Проверить подключение'}
          </button>

          <div className="rezka-footer-spacer" />

          <button type="button" className="rezka-btn rezka-btn--cancel" onClick={onClose}>
            Отмена (Esc)
          </button>

          <button
            type="button"
            className="rezka-btn rezka-btn--save"
            disabled={saving}
            onClick={saveSettings}
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
