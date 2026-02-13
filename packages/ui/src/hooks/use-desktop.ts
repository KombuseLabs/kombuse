/**
 * Hook to detect if the app is running inside the Electron shell.
 */
export function useDesktop() {
  const electron = typeof window !== 'undefined' ? window.electron : undefined
  const isDesktop = !!electron
  const platform = electron?.platform ?? null
  const selectDirectory = electron?.selectDirectory ?? (async () => null)

  return { isDesktop, platform, selectDirectory }
}
