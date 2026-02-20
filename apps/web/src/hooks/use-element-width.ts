import { useState, useEffect, useCallback } from 'react'

export function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(0)

  const ref = useCallback((node: HTMLDivElement | null) => {
    setElement(node)
  }, [])

  useEffect(() => {
    if (!element) return

    setWidth(element.clientWidth)

    let rafId: number | undefined
    const observer = new ResizeObserver((entries) => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          setWidth(entry.contentRect.width)
        }
      })
    })

    observer.observe(element)

    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [element])

  return { ref, width }
}
