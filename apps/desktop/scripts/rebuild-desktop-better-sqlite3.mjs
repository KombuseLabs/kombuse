#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptDir, '..')
const betterSqliteDir = resolve(desktopDir, 'node_modules', 'better-sqlite3')
const electronPackagePath = resolve(desktopDir, 'node_modules', 'electron', 'package.json')
const npmCacheDir = resolve(desktopDir, '..', '..', '.cache', 'npm')
const nodeGypDevDir = resolve(desktopDir, '..', '..', '.cache', 'node-gyp')

let electronVersion = null
try {
  const electronPkg = JSON.parse(readFileSync(electronPackagePath, 'utf8'))
  electronVersion = electronPkg.version
} catch {
  const fallback = spawnSync(
    'node',
    ['-p', "require('./node_modules/electron/package.json').version"],
    { cwd: desktopDir, encoding: 'utf8' }
  )
  if (fallback.status === 0) {
    electronVersion = (fallback.stdout || '').trim()
  }
}

if (!electronVersion) {
  console.error('[native] failed to resolve local electron version')
  process.exit(1)
}

const rebuild = spawnSync(
  '../.bin/electron-rebuild',
  ['-f', '-w', 'better-sqlite3', '-v', electronVersion],
  {
    cwd: betterSqliteDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
      npm_config_devdir: nodeGypDevDir
    }
  }
)

process.exit(rebuild.status ?? 1)
