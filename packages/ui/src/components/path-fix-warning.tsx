import { useEffect } from 'react'
import { toast } from 'sonner'
import { useDesktop } from '../hooks/use-desktop'

export function PathFixWarning() {
  const { pathFixSucceeded } = useDesktop()

  useEffect(() => {
    if (pathFixSucceeded === false) {
      toast.warning(
        'PATH could not be read from your shell. Backends that require version-managed runtimes (Node.js via nvm/fnm) may fail.',
        { duration: 10000 },
      )
    }
  }, [])

  return null
}
