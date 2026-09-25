import { useState, useRef, useEffect, type ReactNode } from 'react'
import { getOptimizedPosterUrl, toProxyImageUrl } from '../utils/imageOptimizer'

export interface VideoCardProps {
  /** Optional title (e.g. video title) */
  title?: string
  /** Optional subtitle or duration */
  subtitle?: string
  /** Formatted duration badge (e.g. "12:35") */
  durationBadge?: string
  /** Poster/cover image URL */
  thumbnailUrl?: string
  /** Author / Channel information */
  author?: {
    name: string
    avatarUrl?: string
  }
  /** Views text (e.g. "1.5 тыс. просмотров") */
  viewsText?: string
  /** Content area (e.g. custom content; ignored if thumbnailUrl is set) */
  children?: ReactNode
  /** Whether this card is focused (for D-pad) */
  focused?: boolean
  /** Click/select handler */
  onSelect?: () => void
  /** Whether video is in favorites (show star) */
  isFavorite?: boolean
  /** Toggle favorite (show button when provided) */
  onToggleFavorite?: () => void
}

/**
 * TV-optimized card: large hit area, clear focus state, duration badge, image fallback.
 */
export function VideoCard({
  title,
  subtitle,
  durationBadge,
  thumbnailUrl,
  author,
  viewsText,
  children,
  focused,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: VideoCardProps) {
  const [imgError, setImgError] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Scroll into view when focused via D-pad navigation
  useEffect(() => {
    if (focused && buttonRef.current && typeof buttonRef.current.scrollIntoView === 'function') {
      buttonRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      })
    }
  }, [focused])

  const showThumb = thumbnailUrl != null && !imgError
  const optimizedThumb = showThumb ? toProxyImageUrl(getOptimizedPosterUrl(thumbnailUrl, 360)) : ''

  const mediaContent = showThumb ? (
    <img
      className="video-card__thumb"
      src={optimizedThumb}
      alt={title || 'Обложка видео'}
      loading="lazy"
      decoding="async"
      onError={() => setImgError(true)}
    />
  ) : (
    children ?? (
      <div className="video-card__placeholder">
        <svg
          className="video-card__placeholder-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <polygon points="5 3 19 12 5 21 5 3" fill="currentColor" fillOpacity="0.3" />
        </svg>
      </div>
    )
  )

  return (
    <div className="video-card-wrap">
      <button
        ref={buttonRef}
        type="button"
        className={`video-card ${focused ? 'video-card--focused' : ''}`}
        onClick={onSelect}
        tabIndex={focused ? 0 : -1}
      >
        <div className="video-card__media">
          {mediaContent}
          {durationBadge && <span className="video-card__badge">{durationBadge}</span>}
        </div>
        {(title != null || subtitle != null || author?.name != null || viewsText != null) && (
          <div className="video-card__meta">
            {title != null && (
              <span className="video-card__title" title={title}>
                {title}
              </span>
            )}
            <div className="video-card__sub-row">
              {author?.name && (
                <span className="video-card__author" title={author.name}>
                  {author.avatarUrl && (
                    <img src={author.avatarUrl} alt="" className="video-card__avatar" />
                  )}
                  {author.name}
                </span>
              )}
              {viewsText && <span className="video-card__views">{viewsText}</span>}
              {!viewsText && !author?.name && subtitle != null && (
                <span className="video-card__subtitle">{subtitle}</span>
              )}
            </div>
          </div>
        )}
      </button>
      {onToggleFavorite != null && (
        <button
          type="button"
          className={`video-card__fav ${isFavorite ? 'video-card__fav--on' : ''}`}
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
