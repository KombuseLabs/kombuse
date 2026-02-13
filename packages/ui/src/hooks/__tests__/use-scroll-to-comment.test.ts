import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

let currentHash = ''

const mockUseLocation = vi.fn(() => ({ hash: currentHash }))

vi.mock('react-router-dom', () => ({
  useLocation: () => mockUseLocation(),
}))

import { useScrollToComment } from '../use-scroll-to-comment'

function appendCommentElement(commentId: number) {
  const element = document.createElement('div')
  element.id = `comment-${commentId}`
  const scrollIntoView = vi.fn()
  Object.defineProperty(element, 'scrollIntoView', {
    value: scrollIntoView,
    configurable: true,
  })
  document.body.appendChild(element)
  return { element, scrollIntoView }
}

describe('useScrollToComment', () => {
  beforeEach(() => {
    currentHash = ''
    document.body.innerHTML = ''
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns an idle state for non-comment hashes', () => {
    currentHash = '#not-a-comment-hash'

    const { result } = renderHook(() => useScrollToComment({ isTimelineLoaded: true }))

    expect(result.current.highlightedCommentId).toBeNull()
    expect(result.current.isScrollToCommentPending).toBe(false)
  })

  it('scrolls and highlights the target when timeline data is loaded', async () => {
    currentHash = '#comment-42'
    const { scrollIntoView } = appendCommentElement(42)

    const { result, rerender } = renderHook(
      ({ isTimelineLoaded }: { isTimelineLoaded: boolean }) =>
        useScrollToComment({ isTimelineLoaded }),
      { initialProps: { isTimelineLoaded: false } }
    )

    expect(result.current.highlightedCommentId).toBeNull()
    expect(result.current.isScrollToCommentPending).toBe(true)

    rerender({ isTimelineLoaded: true })

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' })
    })
    expect(result.current.highlightedCommentId).toBe(42)
    expect(result.current.isScrollToCommentPending).toBe(false)
  })

  it('clears pending state when the target comment element is missing', async () => {
    currentHash = '#comment-9999'

    const { result } = renderHook(() => useScrollToComment({ isTimelineLoaded: true }))

    await waitFor(() => {
      expect(result.current.isScrollToCommentPending).toBe(false)
    })
    expect(result.current.highlightedCommentId).toBeNull()
  })

  it('clears highlight when the hash is removed', async () => {
    currentHash = '#comment-7'
    appendCommentElement(7)

    const { result, rerender } = renderHook(
      ({ isTimelineLoaded }: { isTimelineLoaded: boolean }) =>
        useScrollToComment({ isTimelineLoaded }),
      { initialProps: { isTimelineLoaded: true } }
    )

    await waitFor(() => {
      expect(result.current.highlightedCommentId).toBe(7)
    })

    currentHash = ''
    rerender({ isTimelineLoaded: true })

    await waitFor(() => {
      expect(result.current.highlightedCommentId).toBeNull()
    })
    expect(result.current.isScrollToCommentPending).toBe(false)
  })
})
