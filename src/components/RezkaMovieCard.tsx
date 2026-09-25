import { useState, useRef, useEffect } from 'react'
import type { MovieItem } from '../types/movie'
import { getPosterUrlWithFallback } from '../utils/imageOptimizer'
import './RezkaMovieCard.css'

export interface RezkaMovieCardProps {
  movie: MovieItem
  focused?: boolean
  onSelect: () => void
  isFavorite?: boolean
  onToggleFavorite?: () => void
}

export function RezkaMovieCard({
  movie,
  focused,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: RezkaMovieCardProps) {
  const [retryStage, setRetryStage] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => {
    setRetryStage(0)
    setIsLoaded(false)
  }, [movie.poster])

  // Если изображение уже было закэшировано браузером
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setIsLoaded(true)
    }
  }, [movie.poster, retryStage])

  useEffect(() => {
    if (focused && buttonRef.current && typeof buttonRef.current.scrollIntoView === 'function') {
      buttonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [focused])

  const posterSrc = movie.poster ? getPosterUrlWithFallback(movie.poster, Math.min(retryStage, 3)) : ''

  return (
    <div className="rezka-card-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`rezka-card rezka-movie-card ${focused ? 'rezka-card--focused' : ''}`}
        onClick={onSelect}
        tabIndex={focused ? 0 : -1}
      >
        <div className="rezka-card__media">
          {/* Фоновый плейсхолдер скрывается, когда картинка загружена */}
          {!isLoaded && (
            <div className="rezka-card__placeholder">
              <span className="rezka-card__placeholder-cat">{movie.category || 'Кино'}</span>
            </div>
          )}

          {posterSrc && (
            <img
              key={`${movie.id}-${retryStage}`}
              ref={imgRef}
              src={posterSrc}
              alt={movie.title}
              className="rezka-card__img"
              loading="lazy"
              decoding="async"
              onLoad={() => setIsLoaded(true)}
              onError={() => {
                if (retryStage < 3) {
                  setRetryStage((prev) => prev + 1)
                }
              }}
            />
          )}

          {/* Бейдж качества */}
          {movie.quality && <span className="rezka-card__quality">{movie.quality}</span>}

          {/* Бейдж года */}
          {movie.year && <span className="rezka-card__year">{movie.year}</span>}

          {/* Бейдж рейтинга */}
          {(movie.ratingKp || movie.ratingImdb) && (
            <span className="rezka-card__rating">
              ★ {movie.ratingKp || movie.ratingImdb}
            </span>
          )}
        </div>

        <div className="rezka-card__meta">
          <span className="rezka-card__title" title={movie.title}>
            {movie.title}
          </span>
          <div className="rezka-card__sub">
            <span className="rezka-card__cat">{movie.category || 'Фильм'}</span>
            {movie.subtitle && <span className="rezka-card__info">{movie.subtitle}</span>}
          </div>
        </div>
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          className={`rezka-card__fav ${isFavorite ? 'rezka-card__fav--on' : ''}`}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onToggleFavorite()
          }}
          aria-label={isFavorite ? 'Удалить из избранного' : 'В избранное'}
          title={isFavorite ? 'Удалить из избранного' : 'В избранное'}
        >
          ★
        </button>
      )}
    </div>
  )
}
