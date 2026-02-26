#!/usr/bin/env bun
/**
 * Publish an already-exported plugin to a registry.
 *
 * Usage:
 *   bun run publish-plugin -- --name kombuse-dev --author kombuse --token <token>
 */

import { parseArgs } from 'node:util'
import { readFile, writeFile, rm, access, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { create as createTar } from 'tar'

const { values } = parseArgs({
  options: {
    name: { type: 'string' },
    author: { type: 'string' },
    registry: { type: 'string', default: 'https://kombuse.dev' },
    token: { type: 'string' },
    version: { type: 'string' },
    channel: { type: 'string' },
  },
  strict: true,
})

function fail(message: string): never {
  console.error(`Error: ${message}`)
  process.exit(1)
}

const name = values.name ?? fail('--name is required')
const author = values.author ?? fail('--author is required')
const registry = values.registry!
const token = values.token ?? process.env.PKG_PUBLISH_KEY ?? fail('--token or $PKG_PUBLISH_KEY is required')
const channelArg = values.channel

// Resolve plugin directory
const pluginDir = join(process.cwd(), '.kombuse', 'plugins', name)

try {
  const s = await stat(pluginDir)
  if (!s.isDirectory()) fail(`Not a directory: ${pluginDir}`)
} catch {
  fail(`Plugin directory not found: ${pluginDir}`)
}

const manifestPath = join(pluginDir, 'manifest.json')
const agentsDir = join(pluginDir, 'agents')

try {
  await access(manifestPath)
} catch {
  fail(`manifest.json not found in ${pluginDir}`)
}

try {
  await access(agentsDir)
} catch {
  fail(`agents/ directory not found in ${pluginDir}`)
}

// Read and update manifest
const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as Record<string, unknown>

manifest.author = author
if (values.version) manifest.version = values.version
if (channelArg) manifest.channel = channelArg
if (!manifest.type) manifest.type = 'plugin'

const version = manifest.version as string | undefined
if (!version) fail('No version found — provide --version or set it in manifest.json')
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`Invalid semver version: ${version} (expected MAJOR.MINOR.PATCH)`)

if (manifest.name !== name) {
  fail(`Manifest name "${manifest.name}" does not match --name "${name}"`)
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8')

// Create archive
const archivePath = join(tmpdir(), `publish-plugin-${Date.now()}.tar.gz`)

try {
  await createTar({ gzip: true, file: archivePath, cwd: pluginDir }, ['.'])

  const archiveBuffer = await readFile(archivePath)

  // Upload to registry
  const baseUrl = registry.replace(/\/+$/, '')
  const uploadUrl = `${baseUrl}/api/pkg/${encodeURIComponent(author)}/${encodeURIComponent(name)}${channelArg ? `?channel=${encodeURIComponent(channelArg)}` : ''}`

  console.log(`Publishing ${author}/${name}@${version} to ${baseUrl}...`)

  let response: Response
  try {
    response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/gzip',
      },
      body: archiveBuffer,
    })
  } catch (err) {
    fail(`Failed to connect to registry: ${err instanceof Error ? err.message : err}`)
  }

  if (!response.ok) {
    const errorBody = await response.text()
    let message: string
    try {
      const parsed = JSON.parse(errorBody) as { error?: string }
      message = parsed.error ?? errorBody
    } catch {
      message = errorBody
    }
    fail(`Registry returned ${response.status}: ${message}`)
  }

  const result = (await response.json()) as {
    published: { author: string; name: string; version: string; channel: string; checksum: string; download_url: string }
  }
  const p = result.published

  console.log(`Published successfully!`)
  console.log(`  Version:  ${p.version}`)
  console.log(`  Channel:  ${p.channel}`)
  console.log(`  Checksum: ${p.checksum}`)
  console.log(`  URL:      ${p.download_url}`)
} finally {
  await rm(archivePath, { force: true }).catch(() => {})
}
