import { useState, useEffect } from 'react'
import { useDesktop } from './use-desktop'

const MOBILE_BREAKPOINT = 768

export function useIsMobile(): boolean {
  const { isDesktop } = useDesktop()
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth < MOBILE_BREAKPOINT
  })

  useEffect(() => {
    if (isDesktop) return
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    setIsMobile(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [isDesktop])

  if (isDesktop) return false
  return isMobile
}
