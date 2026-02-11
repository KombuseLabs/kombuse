import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_SCROLL_THRESHOLD = 100

interface UseScrollToBottomOptions {
  /** Trigger auto-scroll when these values change (e.g. item count) */
  deps: unknown[]
  /** Pixels from bottom to consider "at bottom" (default: 100) */
  threshold?: number
  /** When this value changes, force-scroll to bottom (e.g. ticket/session id) */
  initialScrollOnChange?: unknown
}

interface UseScrollToBottomReturn {
  scrollRef: React.RefObject<HTMLDivElement | null>
  isAtBottom: boolean
  scrollToBottom: () => void
  onScroll: () => void
}

function useScrollToBottom(options: UseScrollToBottomOptions): UseScrollToBottomReturn {
  const { deps, threshold = DEFAULT_SCROLL_THRESHOLD, initialScrollOnChange } = options
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setIsAtBottom(distanceFromBottom <= threshold)
  }, [threshold])

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [])

  // Auto-scroll when deps change and user is at the bottom
  useEffect(() => {
    if (isAtBottom) {
      const el = scrollRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, isAtBottom])

  // Force-scroll to bottom when initialScrollOnChange changes
  useEffect(() => {
    if (initialScrollOnChange == null) return
    const el = scrollRef.current
    if (el) {
      // Use requestAnimationFrame to ensure DOM has rendered
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight
        setIsAtBottom(true)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScrollOnChange])

  return { scrollRef, isAtBottom, scrollToBottom, onScroll }
}

export { useScrollToBottom, type UseScrollToBottomOptions, type UseScrollToBottomReturn }
