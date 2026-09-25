import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VideoGrid } from './VideoGrid'
import type { VideoGridItem } from './VideoGrid'

const mockItems: VideoGridItem[] = [
  { id: '1', title: 'Video One', subtitle: '1:30' },
  { id: '2', title: 'Video Two', subtitle: '2:00' },
]

describe('VideoGrid', () => {
  it('renders items', () => {
    render(<VideoGrid items={mockItems} columns={3} />)
    expect(screen.getByText('Video One')).toBeInTheDocument()
    expect(screen.getByText('Video Two')).toBeInTheDocument()
  })

  it('calls onSelectItem when card is clicked', () => {
    const onSelectItem = vi.fn()
    render(<VideoGrid items={mockItems} columns={3} onSelectItem={onSelectItem} />)
    fireEvent.click(screen.getByText('Video One'))
    expect(onSelectItem).toHaveBeenCalledWith(mockItems[0], 0)
  })
})
