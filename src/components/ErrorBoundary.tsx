import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="app app-error-boundary">
          <header className="app-header">
            <h1 className="app-title">Ошибка</h1>
          </header>
          <main className="app-main">
            <p className="app-empty">Что-то пошло не так. Обновите страницу.</p>
            <button
              type="button"
              className="app-retry"
              onClick={() => window.location.reload()}
            >
              Обновить страницу
            </button>
          </main>
        </div>
      )
    }
    return this.props.children
  }
}
