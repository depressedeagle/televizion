import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useTVNavigation } from '../hooks/useTVNavigation'
import { VideoCard } from './VideoCard'
import './VideoGrid.css'

export interface VideoGridItem {
  id: string
  title?: string
  subtitle?: string
  thumbnailUrl?: string
  durationFormatted?: string
  duration?: number
  author?: {
    name: string
    avatarUrl?: string
  }
  viewsText?: string
}

export interface VideoGridProps {
  items: VideoGridItem[]
  columns?: number
  onSelectItem?: (item: VideoGridItem, index: number) => void
  onBack?: () => void
  /** When ArrowUp from first row, move focus to section above (e.g. history) */
  onArrowUp?: () => void
  /** Controlled focus (for unified D-pad with history row) */
  focusedIndex?: number
  onFocusChange?: (index: number) => void
  /** When this grid is not focused (e.g. focus is in history row) */
  navigationDisabled?: boolean
  /** Show favorite toggle on each card */
  isFavorite?: (id: string) => boolean
  onToggleFavorite?: (item: VideoGridItem) => void
}

const DEFAULT_COLUMNS = 3

/**
 * TV layout: grid of 3-4 columns of cards, D-pad spatial focus.
 */
export function VideoGrid({
  items,
  columns = DEFAULT_COLUMNS,
  onSelectItem,
  onBack,
  onArrowUp,
  focusedIndex: controlledFocus,
  onFocusChange: controlledSetFocus,
  navigationDisabled = false,
  isFavorite,
  onToggleFavorite,
}: VideoGridProps) {
  const [internalFocus, setInternalFocus] = useState(0)
  const focusedIndex = controlledFocus ?? internalFocus
  const setFocusedIndex = controlledSetFocus ?? setInternalFocus

  useTVNavigation({
    columns,
    itemCount: items.length,
    focusedIndex,
    onFocusChange: setFocusedIndex,
    onSelect: (index) => items[index] && onSelectItem?.(items[index], index),
    onBack,
    onArrowUp,
    enabled: items.length > 0 && !navigationDisabled,
  })

  return (
    <div className="video-grid" role="list" style={{ '--grid-cols': columns } as CSSProperties}>
      {items.map((item, index) => (
        <div key={item.id} className="video-grid__item" role="listitem">
          <VideoCard
            title={item.title}
            subtitle={item.subtitle}
            durationBadge={item.durationFormatted}
            thumbnailUrl={item.thumbnailUrl}
            author={item.author}
            viewsText={item.viewsText}
            focused={focusedIndex === index}
            onSelect={() => onSelectItem?.(item, index)}
            isFavorite={isFavorite?.(item.id)}
            onToggleFavorite={onToggleFavorite ? () => onToggleFavorite(item) : undefined}
          />
        </div>
      ))}
    </div>
  )
}
