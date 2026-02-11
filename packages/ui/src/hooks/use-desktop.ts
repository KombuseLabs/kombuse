/**
 * Hook to detect if the app is running inside the Electron shell.
 */
export function useDesktop() {
  const isDesktop = typeof window !== 'undefined' && !!window.electron
  const platform = window.electron?.platform ?? null

  return { isDesktop, platform }
}
