import { useEffect, useCallback } from 'react'

export type TVNavigationDirection = 'up' | 'down' | 'left' | 'right'
export type TVNavigationAction = 'select' | 'back'

export interface UseTVNavigationOptions {
  /** Grid columns (for up/down jump and left/right boundary) */
  columns: number
  /** Total number of focusable items */
  itemCount: number
  /** Current focused index (0-based) */
  focusedIndex: number
  /** Callback when focused index should change */
  onFocusChange: (index: number) => void
  /** Callback when user presses Enter / Ok (select) */
  onSelect?: (index: number) => void
  /** Callback when user presses Back / Return (Escape, Backspace, KeyCode 10009 for Tizen, 461 for WebOS) */
  onBack?: () => void
  /** When ArrowDown would leave area, call this instead of moving (e.g. move focus to row below) */
  onArrowDown?: () => void
  /** When ArrowUp would leave area, call this instead of moving (e.g. move focus to row above) */
  onArrowUp?: () => void
  /** When ArrowLeft would leave area */
  onArrowLeft?: () => void
  /** When ArrowRight would leave area */
  onArrowRight?: () => void
  /** Callback for Play/Pause media key from remote */
  onPlayPause?: () => void
  /** Whether navigation is enabled */
  enabled?: boolean
}

/**
 * Хук для D-pad навигации на Smart TV (Samsung Tizen, LG WebOS, Android TV, PWA):
 * - Стрелки (ArrowUp, ArrowDown, ArrowLeft, ArrowRight)
 * - Выбор (Enter, OK)
 * - Возврат (Escape, Backspace, GoBack, keyCode 10009 Tizen, keyCode 461 WebOS)
 * - Медиа-клавиши пульта (Play/Pause)
 */
export function useTVNavigation({
  columns,
  itemCount,
  focusedIndex,
  onFocusChange,
  onSelect,
  onBack,
  onArrowDown,
  onArrowUp,
  onArrowLeft,
  onArrowRight,
  onPlayPause,
  enabled = true,
}: UseTVNavigationOptions): void {
  const clamp = useCallback(
    (value: number) => Math.max(0, Math.min(value, itemCount - 1)),
    [itemCount]
  )

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent): void => {
      // Игнорируем ввод, если фокус находится в текстовом поле поиска
      const activeTag = document.activeElement?.tagName
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') {
        if (e.key === 'Escape') {
          ;(document.activeElement as HTMLElement)?.blur()
        }
        return
      }

      // Игнорируем навигацию сетки/категорий, если фокус находится в шапке (поиск, кнопка профиля "Основной", логотип)
      // или в открытом модальном окне
      const activeEl = document.activeElement
      if (
        activeEl?.closest('.app-header') ||
        activeEl?.closest('.auth-modal-backdrop') ||
        activeEl?.closest('.auth-modal') ||
        activeEl?.closest('.rezka-settings-modal')
      ) {
        return
      }

      // 1. Проверка кнопки возврата (Back) на Tizen, WebOS и ПК
      const isBackButton =
        e.key === 'Escape' ||
        e.key === 'Backspace' ||
        e.key === 'GoBack' ||
        e.key === 'BrowserBack' ||
        e.keyCode === 10009 || // Samsung Tizen Return Key
        e.keyCode === 461 // LG WebOS Return Key

      if (isBackButton) {
        if (onBack) {
          e.preventDefault()
          e.stopPropagation()
          onBack()
          return
        }
      }

      // 2. Медиа-клавиши пульта (Play / Pause)
      const isPlayPause =
        e.key === 'MediaPlayPause' ||
        e.key === 'MediaPlay' ||
        e.key === 'MediaPause' ||
        e.keyCode === 415 || // Play
        e.keyCode === 19 // Pause

      if (isPlayPause && onPlayPause) {
        e.preventDefault()
        onPlayPause()
        return
      }

      // Если нет элементов для навигации
      if (itemCount <= 0) return

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          const nextUp = focusedIndex - columns
          if (nextUp < 0) {
            if (onArrowUp) {
              onArrowUp()
            }
            return
          }
          const next = clamp(nextUp)
          if (next !== focusedIndex) onFocusChange(next)
          break
        }

        case 'ArrowDown': {
          e.preventDefault()
          const nextDown = focusedIndex + columns
          if (nextDown >= itemCount) {
            if (onArrowDown) {
              onArrowDown()
            }
            return
          }
          const next = clamp(nextDown)
          if (next !== focusedIndex) onFocusChange(next)
          break
        }

        case 'ArrowLeft': {
          e.preventDefault()
          if (focusedIndex % columns === 0 && onArrowLeft) {
            onArrowLeft()
            return
          }
          const next = clamp(focusedIndex - 1)
          if (next !== focusedIndex) onFocusChange(next)
          break
        }

        case 'ArrowRight': {
          e.preventDefault()
          if ((focusedIndex + 1) % columns === 0 && onArrowRight) {
            onArrowRight()
            return
          }
          const next = clamp(focusedIndex + 1)
          if (next !== focusedIndex) onFocusChange(next)
          break
        }

        case 'Enter': {
          e.preventDefault()
          onSelect?.(focusedIndex)
          break
        }

        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    columns,
    itemCount,
    focusedIndex,
    onFocusChange,
    onSelect,
    onBack,
    onArrowDown,
    onArrowUp,
    onArrowLeft,
    onArrowRight,
    onPlayPause,
    clamp,
  ])
}
