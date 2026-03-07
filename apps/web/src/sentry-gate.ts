let sentryEnabled = true

export function isSentryEnabled(): boolean {
  return sentryEnabled
}

export function setSentryEnabled(enabled: boolean): void {
  sentryEnabled = enabled
}
