#!/usr/bin/env node

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  rmSync
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptDir, '..')
const nodeModulesDir = resolve(desktopDir, 'node_modules')
const bunStoreDir = resolve(desktopDir, '..', '..', 'node_modules', '.bun')

const localOnlyPackages = ['electron', 'better-sqlite3']

function findBunNodeModulesDir(packageName, version) {
  if (!existsSync(bunStoreDir)) {
    return null
  }

  const normalizedName = packageName.replace('/', '+')
  const entries = readdirSync(bunStoreDir)
  const exactPrefix = version ? `${normalizedName}@${version}` : `${normalizedName}@`

  const match =
    entries.find((entry) => entry === exactPrefix) ??
    entries.find((entry) => entry.startsWith(`${exactPrefix}+`)) ??
    entries.find((entry) => entry.startsWith(exactPrefix))

  if (!match) {
    return null
  }

  const nodeModulesPath = resolve(bunStoreDir, match, 'node_modules')
  return existsSync(nodeModulesPath) ? nodeModulesPath : null
}

function ensureDependencyLinks(packagePath, sourceNodeModulesDir) {
  const packageJsonPath = resolve(packagePath, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  const dependencies = Object.keys(packageJson.dependencies ?? {})
  if (dependencies.length === 0) {
    return
  }

  const localDepsDir = resolve(packagePath, 'node_modules')
  mkdirSync(localDepsDir, { recursive: true })

  for (const dependencyName of dependencies) {
    const localDependencyPath = resolve(localDepsDir, dependencyName)
    let localDependencyExists = existsSync(localDependencyPath)
    if (!localDependencyExists) {
      try {
        lstatSync(localDependencyPath)
        localDependencyExists = true
      } catch {
        localDependencyExists = false
      }
    }

    if (localDependencyExists) {
      continue
    }

    let sourceDependencyPath =
      sourceNodeModulesDir && existsSync(resolve(sourceNodeModulesDir, dependencyName))
        ? resolve(sourceNodeModulesDir, dependencyName)
        : null

    if (!sourceDependencyPath) {
      const fallbackNodeModulesDir = findBunNodeModulesDir(dependencyName)
      if (fallbackNodeModulesDir) {
        const fallbackPath = resolve(fallbackNodeModulesDir, dependencyName)
        if (existsSync(fallbackPath)) {
          sourceDependencyPath = fallbackPath
        }
      }
    }

    if (!sourceDependencyPath) {
      console.warn(`[native] warning: could not link dependency "${dependencyName}" for ${packageJson.name}`)
      continue
    }

    mkdirSync(dirname(localDependencyPath), { recursive: true })
    const relativeTarget = relative(dirname(localDependencyPath), sourceDependencyPath)
    symlinkSync(relativeTarget, localDependencyPath)
    console.log(`[native] linked ${packageJson.name} -> ${dependencyName}`)
  }
}

function replaceSymlinkWithLocalCopy(packageName) {
  const packagePath = resolve(nodeModulesDir, packageName)

  if (!existsSync(packagePath)) {
    throw new Error(`Missing dependency at ${packagePath}. Run "bun install" first.`)
  }

  let sourceNodeModulesDir = null
  const stats = lstatSync(packagePath)
  if (stats.isSymbolicLink()) {
    const targetPath = realpathSync(packagePath)
    sourceNodeModulesDir = dirname(targetPath)
    const tempCopyPath = resolve(nodeModulesDir, `.local-${packageName.replace('/', '_')}-${Date.now()}`)

    cpSync(targetPath, tempCopyPath, {
      recursive: true,
      force: true,
      dereference: true
    })

    rmSync(packagePath, { recursive: true, force: true })
    mkdirSync(dirname(packagePath), { recursive: true })
    renameSync(tempCopyPath, packagePath)

    console.log(`[native] localized ${packageName}`)

    // Re-sign Electron.app after copy — cpSync with dereference breaks the
    // macOS code signature, which prevents Chromium sub-processes from launching.
    if (packageName === 'electron') {
      const electronApp = resolve(packagePath, 'dist', 'Electron.app')
      if (existsSync(electronApp)) {
        execFileSync('codesign', ['--force', '--deep', '--sign', '-', electronApp], {
          stdio: 'inherit'
        })
        console.log('[native] re-signed Electron.app')
      }
    }
  } else {
    console.log(`[native] ${packageName} already local`)

    const localPackageJsonPath = resolve(packagePath, 'package.json')
    if (existsSync(localPackageJsonPath)) {
      const localPackageJson = JSON.parse(readFileSync(localPackageJsonPath, 'utf8'))
      sourceNodeModulesDir = findBunNodeModulesDir(
        localPackageJson.name,
        localPackageJson.version
      )
    }
  }

  ensureDependencyLinks(packagePath, sourceNodeModulesDir)
}

for (const packageName of localOnlyPackages) {
  replaceSymlinkWithLocalCopy(packageName)
}
