'use client'

import { useRef, useLayoutEffect, useCallback, type RefObject } from 'react'

interface UseAutoResizeTextareaOptions {
  value: string
  maxHeight?: number | string
  enabled?: boolean
}

function useAutoResizeTextarea(options: UseAutoResizeTextareaOptions): {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  resize: () => void
} {
  const { value, maxHeight = '60vh', enabled = true } = options
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    let maxPx: number
    if (typeof maxHeight === 'number') {
      maxPx = maxHeight
    } else if (maxHeight.endsWith('vh')) {
      maxPx = (parseFloat(maxHeight) / 100) * window.innerHeight
    } else {
      maxPx = parseFloat(maxHeight) || Infinity
    }

    textarea.style.height = '0px'
    const scrollHeight = textarea.scrollHeight
    const clampedHeight = Math.min(scrollHeight, maxPx)

    textarea.style.height = `${clampedHeight}px`
    textarea.style.overflowY = scrollHeight > maxPx ? 'auto' : 'hidden'
  }, [maxHeight])

  useLayoutEffect(() => {
    if (!enabled) return
    resize()
  }, [value, resize, enabled])

  return { textareaRef, resize }
}

export { useAutoResizeTextarea, type UseAutoResizeTextareaOptions }
