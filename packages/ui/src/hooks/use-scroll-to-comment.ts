import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

const COMMENT_HASH_REGEX = /^#comment-(\d+)$/
const HIGHLIGHT_DURATION_MS = 3000

interface UseScrollToCommentOptions {
  isTimelineLoaded: boolean
}

interface UseScrollToCommentReturn {
  highlightedCommentId: number | null
  isScrollToCommentPending: boolean
}

function useScrollToComment(options: UseScrollToCommentOptions): UseScrollToCommentReturn {
  const { isTimelineLoaded } = options
  const location = useLocation()

  const targetCommentId = useMemo(() => {
    const match = location.hash.match(COMMENT_HASH_REGEX)
    return match ? Number(match[1]) : null
  }, [location.hash])

  const [highlightedCommentId, setHighlightedCommentId] = useState<number | null>(null)
  const [isScrollToCommentPending, setIsScrollToCommentPending] = useState(
    () => location.hash.match(COMMENT_HASH_REGEX) !== null
  )
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // When target changes, mark pending (or clear if no target)
  useEffect(() => {
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current)
      highlightTimeoutRef.current = null
    }

    if (targetCommentId !== null) {
      setIsScrollToCommentPending(true)
      setHighlightedCommentId(null)
    } else {
      setIsScrollToCommentPending(false)
      setHighlightedCommentId(null)
    }
  }, [targetCommentId])

  // Scroll to comment when timeline is loaded and target is pending
  useEffect(() => {
    if (targetCommentId === null || !isTimelineLoaded || !isScrollToCommentPending) return

    const rafId = requestAnimationFrame(() => {
      const element = document.getElementById(`comment-${targetCommentId}`)
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightedCommentId(targetCommentId)
        highlightTimeoutRef.current = setTimeout(() => {
          setHighlightedCommentId(null)
          highlightTimeoutRef.current = null
        }, HIGHLIGHT_DURATION_MS)
      }
      setIsScrollToCommentPending(false)
    })

    return () => cancelAnimationFrame(rafId)
  }, [targetCommentId, isTimelineLoaded, isScrollToCommentPending])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  return { highlightedCommentId, isScrollToCommentPending }
}

export { useScrollToComment, type UseScrollToCommentOptions, type UseScrollToCommentReturn }
