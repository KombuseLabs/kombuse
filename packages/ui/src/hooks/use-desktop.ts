/**
 * Hook to detect if the app is running inside the Electron shell.
 */
export function useDesktop() {
  const electron = typeof window !== 'undefined' ? window.electron : undefined
  const isDesktop = !!electron
  const platform = electron?.platform ?? null
  const selectDirectory = electron?.selectDirectory ?? (async () => null)
  const pathFixSucceeded = electron?.pathFixSucceeded

  return { isDesktop, platform, selectDirectory, pathFixSucceeded }
}
