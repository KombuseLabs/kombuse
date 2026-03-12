import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, resolve, isAbsolute } from 'path'
import type { KombuseConfig } from '@kombuse/types'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('Config')

export function resolveEnvToken(value: string): string {
  if (!value.startsWith('$')) return value
  const envKey = value.slice(1)
  const resolved = process.env[envKey]
  if (!resolved) {
    throw new Error(`Environment variable "${envKey}" is not set (referenced in config as "${value}")`)
  }
  return resolved
}

export function loadProjectConfig(projectLocalPath: string): KombuseConfig {
  const configPath = join(projectLocalPath, '.kombuse', 'config.json')
  return loadKombuseConfig(configPath)
}

export function getKombuseDir(): string {
  return join(
    process.env.HOME || process.env.USERPROFILE || '.',
    '.kombuse'
  )
}

export function getEffectiveProjectPath(project: { id: string; local_path: string | null }): string {
  return project.local_path ?? join(getKombuseDir(), 'projects', project.id)
}

export function resolveDbPath(rawPath: string): string {
  if (isAbsolute(rawPath)) {
    return rawPath
  }
  return resolve(getKombuseDir(), rawPath)
}

export function saveProjectConfig(projectLocalPath: string, config: KombuseConfig): void {
  const kombuseDir = join(projectLocalPath, '.kombuse')
  const configPath = join(kombuseDir, 'config.json')

  if (!existsSync(kombuseDir)) {
    mkdirSync(kombuseDir, { recursive: true })
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
}

export function loadBinaryPathFromFileConfig(binaryName: 'claude' | 'codex'): string | undefined {
  const config = loadKombuseConfig()
  const path = config.binaries?.[binaryName]
  return path && path.trim() ? path.trim() : undefined
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
      logger.warn(`Invalid config (expected object): ${path}`)
      return {}
    }
    return parsed as KombuseConfig
  } catch (err) {
    logger.warn(`Failed to read config: ${path}`, { error: err instanceof Error ? err.message : String(err) })
    return {}
  }
}
