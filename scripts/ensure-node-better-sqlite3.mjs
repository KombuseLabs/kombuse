#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDir, '..')
const persistencePath = resolve(repoRoot, 'packages', 'persistence')
const npmCacheDir = resolve(repoRoot, '.cache', 'npm')
const nodeGypDevDir = resolve(repoRoot, '.cache', 'node-gyp')
const nodeDir = resolve(process.execPath, '..', '..')
const require = createRequire(import.meta.url)

function canLoadBetterSqlite3() {
  try {
    const resolved = require.resolve('better-sqlite3', { paths: [persistencePath] })
    const BetterSqlite3 = require(resolved)
    const db = new BetterSqlite3(':memory:')
    db.close()
    return true
  } catch (error) {
    const message = String(error?.message || '')
    if (
      message.includes('NODE_MODULE_VERSION') ||
      message.includes('ERR_DLOPEN_FAILED') ||
      message.includes("Cannot find module 'better-sqlite3'") ||
      message.includes("Cannot find module 'bindings'") ||
      message.includes('Could not locate the bindings file')
    ) {
      return false
    }
    throw error
  }
}

if (canLoadBetterSqlite3()) {
  console.log('[native] better-sqlite3 matches current Node ABI')
  process.exit(0)
}

console.log('[native] better-sqlite3 ABI mismatch detected, rebuilding for current Node...')
const rebuild = spawnSync(
  'npm',
  ['rebuild', 'better-sqlite3', '--prefix', 'packages/persistence'],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_cache: npmCacheDir,
      npm_config_devdir: nodeGypDevDir,
      npm_config_nodedir: nodeDir
    }
  }
)

if (rebuild.status !== 0) {
  process.exit(rebuild.status ?? 1)
}

if (!canLoadBetterSqlite3()) {
  console.error('[native] better-sqlite3 still failed after rebuild')
  process.exit(1)
}

console.log('[native] better-sqlite3 rebuilt for current Node ABI')
