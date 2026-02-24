import { readFileSync, existsSync } from 'fs'
import { join, resolve, isAbsolute } from 'path'
import type { KombuseConfig } from '@kombuse/types'

export function getKombuseDir(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.kombuse'
  )
}

export function resolveDbPath(rawPath: string): string {
  if (isAbsolute(rawPath)) {
    return rawPath
  }
  return resolve(getKombuseDir(), rawPath)
}

export function loadKombuseConfig(configPath?: string): KombuseConfig {
  const path = configPath ?? join(getKombuseDir(), 'config.json')

  if (!existsSync(path)) {
    return {}
  }

  try {
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn(`[Kombuse] Invalid config (expected object): ${path}`)
      return {}
    }
    return parsed as KombuseConfig
  } catch (err) {
    console.warn(`[Kombuse] Failed to read config: ${path}`, err)
    return {}
  }
}
