import { join } from 'node:path'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { pack } from '@kombuse/pkg'
import type { PluginPublishInput, PluginPublishResult } from '@kombuse/types'
import { pluginExportService } from './plugin-export-service'

export class PluginPublishError extends Error {
  public readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'PluginPublishError'
    this.statusCode = statusCode
  }
}

export class PluginPublishService {
  async publish(input: PluginPublishInput): Promise<PluginPublishResult> {
    const {
      package_name,
      project_id,
      author,
      registry_url,
      token,
      agent_ids,
      channel,
      version,
      description,
      overwrite,
    } = input

    // Export plugin to directory
    const exportResult = await pluginExportService.exportPackage({
      package_name,
      project_id,
      agent_ids,
      author,
      version,
      description,
      overwrite: overwrite ?? true,
    })

    const archivePath = join(tmpdir(), `plugin-publish-${Date.now()}.tar.gz`)

    try {
      // Write registry-compatible manifest.json into the exported directory
      const registryManifest = {
        author,
        name: package_name,
        version: version ?? '1.0.0',
        type: 'plugin' as const,
        ...(channel ? { channel } : {}),
      }
      await writeFile(
        join(exportResult.directory, 'manifest.json'),
        JSON.stringify(registryManifest, null, 2),
        'utf-8'
      )

      // Create .tar.gz archive from the exported directory
      await pack({
        sourceDir: exportResult.directory,
        outputPath: archivePath,
      })

      // Read the archive as a buffer
      const archiveBuffer = await readFile(archivePath)

      // Upload to registry
      const baseUrl = registry_url.replace(/\/+$/, '')
      const uploadUrl = `${baseUrl}/api/pkg/${encodeURIComponent(author)}/${encodeURIComponent(package_name)}${channel ? `?channel=${encodeURIComponent(channel)}` : ''}`

      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/gzip',
        },
        body: archiveBuffer,
      })

      if (!response.ok) {
        const errorBody = await response.text()
        let message: string
        try {
          const parsed = JSON.parse(errorBody) as { error?: string }
          message = parsed.error ?? errorBody
        } catch {
          message = errorBody
        }
        throw new PluginPublishError(response.status, message)
      }

      const result = (await response.json()) as { published: PluginPublishResult }
      return result.published
    } finally {
      await rm(archivePath, { force: true }).catch(() => {})
    }
  }
}

export const pluginPublishService = new PluginPublishService()
