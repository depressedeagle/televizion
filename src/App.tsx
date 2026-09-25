import { useState, useCallback, useEffect, useRef } from 'react'
import { Routes, Route, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { RezkaSection } from './components/RezkaSection'
import { RezkaPlayer } from './components/RezkaPlayer'
import { AuthModal } from './components/AuthModal'
import { authService, type UserProfile } from './services/authService'
import { pushBackHandler } from './utils/tvBackHandler'
import { fetchTmdbMovieDetail } from './services/tmdbApi'
import type { MovieDetail, MovieItem } from './types/movie'

function MovieRoute({ onBack }: { onBack: () => void }) {
  const { id } = useParams<{ id: string }>()
  const [movie, setMovie] = useState<MovieDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)

    fetchTmdbMovieDetail(id)
      .then((m) => {
        setMovie(m)
        setError(null)
      })
      .catch((e) => {
        console.error(e)
        setError('Не удалось загрузить фильм')
      })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="rezka-player-page rezka-player-wrap">
        <header className="rezka-player-header">
          <button type="button" className="rezka-back-btn" onClick={onBack} aria-label="В каталог фильмов">
            ← В каталог (Esc)
          </button>
        </header>
        <div className="rezka-loading-msg">Загрузка информации о фильме…</div>
      </div>
    )
  }

  if (error || !movie) {
    return (
      <div className="rezka-player-page rezka-player-wrap">
        <header className="rezka-player-header">
          <button type="button" className="rezka-back-btn" onClick={onBack} aria-label="В каталог фильмов">
            ← В каталог (Esc)
          </button>
        </header>
        <div className="app-error" style={{ margin: '2rem auto' }}>
          {error || 'Фильм не найден'}
        </div>
      </div>
    )
  }

  return <RezkaPlayer movie={movie} onBack={onBack} />
}

function App() {
  const [searchParams, setSearchParams] = useSearchParams()
  const qFromUrl = searchParams.get('q') || ''
  const [searchInput, setSearchInput] = useState(qFromUrl)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [activeProfile, setActiveProfile] = useState<UserProfile>(() => authService.getActiveProfile())
  const navigate = useNavigate()

  const headerRef = useRef<HTMLElement>(null)
  const logoBtnRef = useRef<HTMLButtonElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchBtnRef = useRef<HTMLButtonElement>(null)
  const profileBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const unsubscribe = authService.subscribe((profile) => {
      setActiveProfile(profile)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!isAuthOpen) return
    const unregister = pushBackHandler(() => {
      setIsAuthOpen(false)
      return true
    })
    return () => unregister()
  }, [isAuthOpen])

  const handleSearchSubmit = useCallback(
    (val: string) => {
      const q = val.trim()
      if (q) {
        setSearchParams({ q })
      } else {
        setSearchParams({})
      }
    },
    [setSearchParams]
  )

  const handleFocusHeader = useCallback(() => {
    window.scrollTo(0, 0)
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
    headerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    searchInputRef.current?.focus()
  }, [])

  const handleOpenMovie = useCallback(
    (movie: MovieItem) => {
      navigate(`/movie/${movie.id}`)
    },
    [navigate]
  )

  const handleBackToCatalog = useCallback(() => {
    navigate('/')
  }, [navigate])

  return (
    <div className="app">
      <Routes>
        <Route path="/movie/:id" element={<MovieRoute onBack={handleBackToCatalog} />} />
        <Route path="/rezka/:id" element={<MovieRoute onBack={handleBackToCatalog} />} />
        <Route
          path="*"
          element={
            <>
              <header ref={headerRef} className="app-header">
                <div className="app-header__top">
                  <button
                    ref={logoBtnRef}
                    type="button"
                    className="app-header__logo"
                    onClick={() => {
                      setSearchInput('')
                      setSearchParams({})
                      navigate('/')
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        window.dispatchEvent(new CustomEvent('tv_focus_categories'))
                      } else if (e.key === 'ArrowRight') {
                        e.preventDefault()
                        searchInputRef.current?.focus()
                      }
                    }}
                  >
                    <h1 className="app-title">🎬 Televizion</h1>
                    <span className="app-subtitle">Онлайн-кинотеатр: фильмы, сериалы, аниме</span>
                  </button>

                  <div className="app-header__right">
                    <div className="app-header__search">
                      <input
                        ref={searchInputRef}
                        type="search"
                        className="app-search-input"
                        placeholder="Поиск фильмов, сериалов, аниме…"
                        value={searchInput}
                        onChange={(e) => {
                          setSearchInput(e.target.value)
                          if (!e.target.value) setSearchParams({})
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleSearchSubmit(searchInput)
                          } else if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            searchInputRef.current?.blur()
                            window.dispatchEvent(new CustomEvent('tv_focus_categories'))
                          } else if (e.key === 'ArrowRight') {
                            e.preventDefault()
                            searchBtnRef.current?.focus()
                          } else if (e.key === 'ArrowLeft' && !searchInput) {
                            e.preventDefault()
                            logoBtnRef.current?.focus()
                          }
                        }}
                        aria-label="Поиск"
                      />
                      {searchInput && (
                        <button
                          type="button"
                          className="app-search-clear"
                          onClick={() => {
                            setSearchInput('')
                            setSearchParams({})
                            searchInputRef.current?.focus()
                          }}
                          aria-label="Очистить"
                        >
                          ×
                        </button>
                      )}
                      <button
                        ref={searchBtnRef}
                        type="button"
                        className="app-search-btn"
                        onClick={() => handleSearchSubmit(searchInput)}
                        onKeyDown={(e) => {
                          if (e.key === 'ArrowDown') {
                            e.preventDefault()
                            window.dispatchEvent(new CustomEvent('tv_focus_categories'))
                          } else if (e.key === 'ArrowLeft') {
                            e.preventDefault()
                            searchInputRef.current?.focus()
                          } else if (e.key === 'ArrowRight') {
                            e.preventDefault()
                            profileBtnRef.current?.focus()
                          }
                        }}
                      >
                        Найти
                      </button>
                    </div>

                    {/* Кнопка профиля и авторизации для ТВ */}
                    <button
                      ref={profileBtnRef}
                      type="button"
                      className="app-header__profile-btn"
                      onClick={() => setIsAuthOpen(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') {
                          e.preventDefault()
                          profileBtnRef.current?.blur()
                          window.dispatchEvent(new CustomEvent('tv_focus_categories'))
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault()
                          searchBtnRef.current?.focus()
                        } else if (e.key === 'ArrowRight') {
                          e.preventDefault()
                        }
                      }}
                      title="Профиль и настройки"
                    >
                      <span className="app-profile-avatar">{activeProfile.avatar}</span>
                      <span className="app-profile-name">{activeProfile.name}</span>
                      <span className="app-profile-arrow">▾</span>
                    </button>
                  </div>
                </div>
              </header>

              <main className="app-main">
                <RezkaSection
                  onOpenMovie={handleOpenMovie}
                  searchQuery={qFromUrl || searchInput}
                  onFocusHeader={handleFocusHeader}
                />
              </main>

              <AuthModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
            </>
          }
        />
      </Routes>
    </div>
  )
}

export default App
