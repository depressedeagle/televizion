/**
 * Глобальный диспетчер кнопки "Назад" (Back / стрелка назад на пульте Smart TV).
 * Предотвращает случайный вылет из приложения.
 * Работает по принципу стека:
 * 1. Закрытие открытых панелей/шторок (качество, серии, озвучка)
 * 2. Закрытие модальных окон (профиль, настройки)
 * 3. Выход из плеера в каталог фильмов
 * 4. На главном экране: двойное нажатие для подтверждения выхода
 */

type BackHandler = () => boolean | void // возвращает true, если событие обработано

const handlerStack: BackHandler[] = []
let lastBackPressTime = 0
let exitToastTimeout: ReturnType<typeof setTimeout> | null = null

export function pushBackHandler(handler: BackHandler): () => void {
  handlerStack.push(handler)
  return () => {
    const idx = handlerStack.lastIndexOf(handler)
    if (idx !== -1) {
      handlerStack.splice(idx, 1)
    }
  }
}

export function handleTvBack(): void {
  // 1. Проверяем зарегистрированные обработчики в стеке (сверху вниз)
  for (let i = handlerStack.length - 1; i >= 0; i--) {
    const handler = handlerStack[i]
    const consumed = handler()
    if (consumed !== false) {
      return
    }
  }

  // 2. Если стек пуст — мы на главном экране каталога
  const now = Date.now()
  if (now - lastBackPressTime < 2500) {
    // Второе нажатие в течение 2.5 секунд — выходим из приложения
    if ((window as any).AndroidNativeApp?.exitApp) {
      ;(window as any).AndroidNativeApp.exitApp()
    } else if ((window as any).Capacitor?.Plugins?.App?.exitApp) {
      ;(window as any).Capacitor.Plugins.App.exitApp()
    }
  } else {
    lastBackPressTime = now
    showExitToast()
  }
}

function showExitToast(): void {
  let toast = document.getElementById('tv-exit-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'tv-exit-toast'
    toast.className = 'tv-exit-toast'
    toast.textContent = 'Нажмите «Назад» ещё раз для выхода из приложения'
    document.body.appendChild(toast)
  }

  toast.classList.add('tv-exit-toast--visible')

  if (exitToastTimeout) clearTimeout(exitToastTimeout)
  exitToastTimeout = setTimeout(() => {
    toast?.classList.remove('tv-exit-toast--visible')
  }, 2400)
}

// Глобальная инициализация слушателей для ТВ-пульта и Android
if (typeof window !== 'undefined') {
  // Аппаратная кнопка Android TV (через MainActivity)
  window.addEventListener('tv_hardware_back', () => {
    handleTvBack()
  })

  // Клавиатурные события (Escape, Backspace, Tizen 10009, webOS 461, Android 4)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (
      e.key === 'Escape' ||
      e.key === 'Backspace' ||
      e.key === 'GoBack' ||
      e.keyCode === 4 ||
      e.keyCode === 10009 ||
      e.keyCode === 461
    ) {
      // Игнорируем Backspace, если пользователь печатает в поле ввода
      const target = e.target as HTMLElement
      if (e.key === 'Backspace' && target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return
      }

      e.preventDefault()
      e.stopPropagation()
      handleTvBack()
    }
  })
}
