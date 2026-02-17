import { useRef, useState, useEffect } from 'react'

export function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    setWidth(el.clientWidth)

    let rafId: number | undefined
    const observer = new ResizeObserver((entries) => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          setWidth(entry.contentRect.width)
        }
      })
    })

    observer.observe(el)

    return () => {
      if (rafId !== undefined) cancelAnimationFrame(rafId)
      observer.disconnect()
    }
  }, [])

  return { ref, width }
}
