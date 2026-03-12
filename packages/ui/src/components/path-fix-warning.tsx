import { useEffect } from 'react'
import { toast } from 'sonner'
import { useDesktop } from '../hooks/use-desktop'

export function PathFixWarning() {
  const { pathFixSucceeded } = useDesktop()

  useEffect(() => {
    if (pathFixSucceeded === false) {
      toast.info(
        'Shell PATH could not be fully resolved. Most tools will still work via built-in fallback paths.',
        { duration: 5000 },
      )
    }
  }, [])

  return null
}
