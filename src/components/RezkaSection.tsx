import { useState, useEffect, useCallback, useRef } from 'react'
import type { MovieItem } from '../types/movie'
import { fetchTmdbFeed, searchTmdb } from '../services/tmdbApi'
import { useTVNavigation } from '../hooks/useTVNavigation'
import {
  getAllWatchProgress,
  deleteWatchProgress,
  clearAllWatchProgress,
  formatWatchTime,
  type WatchProgressRecord,
} from '../services/watchProgress'
import { RezkaMovieCard } from './RezkaMovieCard'
import { getPosterUrlWithFallback } from '../utils/imageOptimizer'
import './RezkaSection.css'

const MOVIE_CATEGORIES = [
  { id: 'films', label: '🎬 Фильмы' },
  { id: 'series', label: '📺 Сериалы' },
  { id: 'cartoons', label: '🧸 Мультфильмы' },
  { id: 'animation', label: '⛩️ Аниме' },
  { id: 'new', label: '🔥 Новинки' },
  { id: 'history', label: '🕒 История' },
  { id: 'favorites', label: '⭐ Избранное' },
]

const FAVORITES_KEY = 'televizion_movie_favs'

function loadFavorites(): MovieItem[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY) || localStorage.getItem('televizion_rezka_favs')
    if (!raw) return []
    return JSON.parse(raw) as MovieItem[]
  } catch {
    return []
  }
}

function saveFavorites(favs: MovieItem[]): void {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs))
  } catch {
    // ignore
  }
}

function historyRecordToMovie(rec: WatchProgressRecord): MovieItem {
  return {
    id: rec.movieId,
    title: rec.movieTitle,
    poster: rec.moviePoster || '',
    url: '',
    category: rec.isSeries ? 'series' : 'films',
    isSeries: rec.isSeries,
    subtitle:
      rec.isSeries && rec.season && rec.episode
        ? `Сезон ${rec.season}, Серия ${rec.episode}`
        : undefined,
  }
}

interface RezkaHistoryCardProps {
  rec: WatchProgressRecord
  onOpen: (movie: MovieItem) => void
  onDelete: (movieId: string) => void
}

function RezkaHistoryCard({ rec, onOpen, onDelete }: RezkaHistoryCardProps) {
  const [stage, setStage] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isError, setIsError] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  const percent =
    rec.duration > 0
      ? Math.min(100, Math.round((rec.currentTime / rec.duration) * 100))
      : 0

  const posterSrc = rec.moviePoster ? getPosterUrlWithFallback(rec.moviePoster, Math.min(stage, 3)) : ''

  useEffect(() => {
    setStage(0)
    setIsLoaded(false)
    setIsError(false)
  }, [rec.moviePoster])

  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true)
    }
  }, [posterSrc, stage])

  return (
    <div className="rezka-history-card">
      <div
        className="rezka-history-poster-wrap"
        onClick={() => onOpen(historyRecordToMovie(rec))}
        tabIndex={0}
        role="button"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onOpen(historyRecordToMovie(rec))
          }
        }}
      >
        {(!isLoaded || isError || !posterSrc) && (
          <div className="rezka-history-poster-placeholder">
            <span className="rezka-history-placeholder-icon">🎬</span>
            <span className="rezka-history-placeholder-title">{rec.movieTitle}</span>
          </div>
        )}

        {posterSrc && !isError && (
          <img
            key={`${rec.movieId}-${stage}`}
            ref={imgRef}
            src={posterSrc}
            alt={rec.movieTitle}
            className={`rezka-history-poster ${isLoaded ? 'rezka-history-poster--loaded' : 'rezka-history-poster--hidden'}`}
            loading="lazy"
            decoding="async"
            onLoad={() => setIsLoaded(true)}
            onError={() => {
              if (stage < 3) {
                setStage((prev) => prev + 1)
              } else {
                setIsError(true)
              }
            }}
          />
        )}

        {rec.isSeries && rec.season && rec.episode && (
          <span className="rezka-history-ep-badge">
            С{rec.season} • Э{rec.episode}
          </span>
        )}

        <div className="rezka-history-progress-bar">
          <div
            className="rezka-history-progress-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="rezka-history-info">
        <h4 className="rezka-history-name" title={rec.movieTitle}>
          {rec.movieTitle}
        </h4>
        <div className="rezka-history-time-meta">
          <span>
            {rec.duration > 0
              ? `${formatWatchTime(rec.currentTime)} / ${formatWatchTime(rec.duration)}`
              : formatWatchTime(rec.currentTime)}
          </span>
          <button
            type="button"
            className="rezka-history-del-btn"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(rec.movieId)
            }}
            title="Удалить из истории"
            aria-label="Удалить из истории"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}

interface MovieSectionProps {
  onOpenMovie: (movie: MovieItem) => void
  searchQuery?: string
  onFocusHeader?: () => void
}

export function RezkaSection({ onOpenMovie, searchQuery = '', onFocusHeader }: MovieSectionProps) {
  const [category, setCategory] = useState<string>('films')
  const [items, setItems] = useState<MovieItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [hasNext, setHasNext] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<MovieItem[]>(loadFavorites)
  const [historyItems, setHistoryItems] = useState<WatchProgressRecord[]>(getAllWatchProgress)

  const sentinelRef = useRef<HTMLDivElement>(null)

  // Обновление истории при событиях
  const refreshHistory = useCallback(() => {
    setHistoryItems(getAllWatchProgress())
  }, [])

  useEffect(() => {
    window.addEventListener('tv_watch_progress_updated', refreshHistory)
    return () => window.removeEventListener('tv_watch_progress_updated', refreshHistory)
  }, [refreshHistory])

  // Слушатель для перехода фокуса в категории сверху (например, от поиска)
  useEffect(() => {
    const handleFocusCategories = () => {
      setFocusArea('categories')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    window.addEventListener('tv_focus_categories', handleFocusCategories)
    return () => window.removeEventListener('tv_focus_categories', handleFocusCategories)
  }, [])

  // Область фокуса для ТВ: 'categories' | 'grid'
  const [focusArea, setFocusArea] = useState<'categories' | 'grid'>('grid')
  const [focusedCategoryIdx, setFocusedCategoryIdx] = useState(0)
  const [focusedGridIdx, setFocusedGridIdx] = useState(0)

  // Навигация по сетке карточек
  useTVNavigation({
    columns: 4,
    itemCount: items.length,
    focusedIndex: focusedGridIdx,
    onFocusChange: (idx) => {
      setFocusedGridIdx(idx)
      // Авто-подгрузка при приближении к концу списка
      if (hasNext && !loading && !loadingMore && !loadMoreError && idx >= items.length - 8) {
        loadMore()
      }
    },
    onSelect: (index) => items[index] && onOpenMovie(items[index]),
    onArrowUp: () => {
      setFocusArea('categories')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    },
    onArrowDown: () => {
      if (hasNext && !loading && !loadingMore && !loadMoreError) {
        loadMore()
      }
    },
    enabled: focusArea === 'grid' && items.length > 0,
  })

  // Навигация по категориям
  useTVNavigation({
    columns: MOVIE_CATEGORIES.length,
    itemCount: MOVIE_CATEGORIES.length,
    focusedIndex: focusedCategoryIdx,
    onFocusChange: (idx) => {
      setFocusedCategoryIdx(idx)
      setCategory(MOVIE_CATEGORIES[idx].id)
      setFocusedGridIdx(0)
    },
    onSelect: (idx) => {
      setCategory(MOVIE_CATEGORIES[idx].id)
      setFocusArea('grid')
      setFocusedGridIdx(0)
    },
    onArrowDown: () => {
      if (items.length > 0) {
        setFocusArea('grid')
      }
    },
    onArrowUp: () => {
      onFocusHeader?.()
      window.scrollTo(0, 0)
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
    },
    enabled: focusArea === 'categories',
  })

  const activeReqId = useRef(0)

  const isFavorite = useCallback(
    (id: string) => favorites.some((f) => f.id === id),
    [favorites]
  )

  const toggleFavorite = useCallback((movie: MovieItem) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => f.id === movie.id)
      const next = exists ? prev.filter((f) => f.id !== movie.id) : [movie, ...prev]
      saveFavorites(next)
      return next
    })
  }, [])

  const loadData = useCallback(
    (cat: string, p = 1, query = '') => {
      const reqId = ++activeReqId.current

      // 1. Категория "История просмотров"
      if (cat === 'history') {
        const hList = getAllWatchProgress()
        setHistoryItems(hList)
        setItems(hList.map(historyRecordToMovie))
        setLoading(false)
        setHasNext(false)
        setError(null)
        setLoadMoreError(null)
        return
      }

      // 2. Категория "Избранное"
      if (cat === 'favorites') {
        const favs = loadFavorites()
        setFavorites(favs)
        setItems(favs)
        setLoading(false)
        setHasNext(false)
        setError(null)
        setLoadMoreError(null)
        return
      }

      // 3. Каталог TMDB / Поиск
      if (p === 1) {
        setLoading(true)
        setError(null)
        setLoadMoreError(null)
      } else {
        setLoadingMore(true)
        setLoadMoreError(null)
      }

      const reqPromise = query.trim() ? searchTmdb(query.trim(), p) : fetchTmdbFeed(cat, p)

      reqPromise
        .then((res) => {
          if (reqId !== activeReqId.current) return
          if (p === 1) {
            setItems(res.items || [])
          } else {
            setItems((prev) => {
              const existingIds = new Set(prev.map((it) => it.id))
              const newItems = (res.items || []).filter((it) => !existingIds.has(it.id))
              return [...prev, ...newItems]
            })
          }
          setPage(res.page || p)
          setHasNext(Boolean(res.hasNext))
          setError(null)
          setLoadMoreError(null)
        })
        .catch((e) => {
          if (reqId !== activeReqId.current) return
          console.error('[Catalog] Error loading movies:', e)
          if (p === 1) {
            setError('Не удалось загрузить каталог фильмов. Проверьте интернет-соединение.')
          } else {
            setLoadMoreError('Не удалось подгрузить следующие фильмы. Нажмите для повтора.')
          }
        })
        .finally(() => {
          if (reqId === activeReqId.current) {
            setLoading(false)
            setLoadingMore(false)
          }
        })
    },
    []
  )

  // Загрузка при изменении категории или поиска
  useEffect(() => {
    loadData(category, 1, searchQuery)
  }, [category, searchQuery, loadData])

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasNext || category === 'history' || category === 'favorites') return
    loadData(category, page + 1, searchQuery)
  }, [loading, loadingMore, hasNext, loadData, category, page, searchQuery])

  // Автоматическая подгрузка при скролле через IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (entry.isIntersecting && hasNext && !loading && !loadingMore && !loadMoreError) {
          loadMore()
        }
      },
      {
        root: null,
        rootMargin: '500px 0px',
        threshold: 0,
      }
    )

    observer.observe(sentinel)
    return () => {
      observer.disconnect()
    }
  }, [hasNext, loading, loadingMore, loadMoreError, loadMore])

  return (
    <div className="rezka-section">
      {/* Навигационная панель каталога */}
      <div className="rezka-nav-bar">
        <h2 className="rezka-heading">🎬 Фильмы и Сериалы</h2>

        <div className="rezka-categories" role="tablist">
          {MOVIE_CATEGORIES.map((cat, idx) => {
            const isCatActive = category === cat.id && !searchQuery
            const isCatFocused = focusArea === 'categories' && focusedCategoryIdx === idx

            return (
              <button
                key={cat.id}
                ref={(el) => {
                  if (isCatFocused && el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                  }
                }}
                type="button"
                role="tab"
                aria-selected={isCatActive}
                className={`rezka-cat-btn ${isCatActive ? 'rezka-cat-btn--active' : ''} ${
                  isCatFocused ? 'rezka-cat-btn--focused' : ''
                }`}
                onClick={() => {
                  setCategory(cat.id)
                  setFocusedCategoryIdx(idx)
                  setFocusArea('grid')
                  setFocusedGridIdx(0)
                }}
              >
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="app-error rezka-error-banner">
          <span>{error}</span>
          <button
            type="button"
            className="app-retry"
            onClick={() => loadData(category, 1, searchQuery)}
          >
            Повторить
          </button>
        </div>
      )}

      {/* СЕКЦИЯ "ПРОДОЛЖИТЬ ПРОСМОТР" (горизонтальная карусель на главной) */}
      {historyItems.length > 0 && !searchQuery && category !== 'history' && (
        <section className="rezka-history-section">
          <div className="rezka-history-head">
            <h2 className="rezka-history-title">🕒 Продолжить просмотр</h2>
            <button
              type="button"
              className="rezka-history-all-btn"
              onClick={() => {
                setCategory('history')
                const idx = MOVIE_CATEGORIES.findIndex((c) => c.id === 'history')
                if (idx !== -1) setFocusedCategoryIdx(idx)
              }}
            >
              Вся история ({historyItems.length}) →
            </button>
          </div>
          <div className="rezka-history-row">
            {historyItems.slice(0, 10).map((rec) => (
              <RezkaHistoryCard
                key={rec.movieId}
                rec={rec}
                onOpen={onOpenMovie}
                onDelete={deleteWatchProgress}
              />
            ))}
          </div>
        </section>
      )}

      {/* ШАПКА РАЗДЕЛА ИСТОРИИ */}
      {category === 'history' && !searchQuery && (
        <div className="rezka-history-page-header">
          <p className="rezka-history-count">
            Сохранено просмотренных фильмов и серий: {historyItems.length}
          </p>
          {historyItems.length > 0 && (
            <button
              type="button"
              className="rezka-history-clear-btn"
              onClick={() => {
                if (window.confirm('Очистить всю историю просмотров?')) {
                  clearAllWatchProgress()
                }
              }}
            >
              🗑️ Очистить всю историю
            </button>
          )}
        </div>
      )}

      {/* Избранные фильмы (если не выбрана вкладка favorites) */}
      {favorites.length > 0 && !searchQuery && category !== 'favorites' && category !== 'history' && (
        <section className="rezka-favorites-section">
          <div className="rezka-fav-head">
            <h2 className="rezka-fav-title">⭐ Избранное</h2>
          </div>
          <div className="rezka-favorites-row">
            {favorites.map((fav) => (
              <div key={fav.id} className="rezka-fav-item">
                <RezkaMovieCard
                  movie={fav}
                  onSelect={() => onOpenMovie(fav)}
                  isFavorite={true}
                  onToggleFavorite={() => toggleFavorite(fav)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Индикатор начальной загрузки */}
      {loading && <div className="rezka-loading-msg">Загрузка каталога…</div>}

      {/* Пустой список */}
      {!loading && !error && items.length === 0 && (
        <div className="app-empty-state">
          <p className="app-empty">
            {category === 'history'
              ? 'История просмотров пока пуста. Начните смотреть фильм или сериал, и он появится здесь!'
              : category === 'favorites'
              ? 'У вас пока нет фильмов в избранном. Нажмите ⭐ на карточке любого фильма, чтобы сохранить его.'
              : searchQuery
              ? `По запросу «${searchQuery}» ничего не найдено.`
              : 'Фильмы не найдены.'}
          </p>
        </div>
      )}

      {/* Сетка фильмов с карточками */}
      <div className="rezka-grid rezka-movie-grid" role="list">
        {items.map((item, idx) => (
          <div key={item.id} className="rezka-grid__item" role="listitem">
            <RezkaMovieCard
              movie={item}
              focused={focusArea === 'grid' && focusedGridIdx === idx}
              onSelect={() => onOpenMovie(item)}
              isFavorite={isFavorite(item.id)}
              onToggleFavorite={() => toggleFavorite(item)}
            />
          </div>
        ))}
      </div>

      {/* Сенсор для автоматической подгрузки фильмов при прокрутке */}
      {hasNext && <div ref={sentinelRef} className="rezka-scroll-sentinel" aria-hidden="true" />}

      {/* Индикатор фоновой подгрузки фильмов */}
      {loadingMore && (
        <div className="rezka-infinite-loader" aria-live="polite">
          <div className="rezka-infinite-spinner" />
          <span className="rezka-infinite-text">Загрузка следующих фильмов…</span>
        </div>
      )}

      {/* Ошибка фоновой подгрузки с кнопкой повтора */}
      {loadMoreError && (
        <div className="rezka-infinite-error">
          <span>{loadMoreError}</span>
          <button
            type="button"
            className="rezka-infinite-retry-btn"
            onClick={() => {
              setLoadMoreError(null)
              loadMore()
            }}
          >
            Повторить попытку 🔄
          </button>
        </div>
      )}

      {/* Окончание каталога */}
      {!hasNext && items.length > 0 && !loading && (
        <div className="rezka-catalog-end">
          <span className="rezka-catalog-end__line" />
          <span className="rezka-catalog-end__text">✨ Все фильмы каталога загружены</span>
          <span className="rezka-catalog-end__line" />
        </div>
      )}
    </div>
  )
}
