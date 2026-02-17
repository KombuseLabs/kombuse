import type { FastifyInstance } from 'fastify'
import {
  pluginExportService,
  PackageExistsError,
  pluginImportService,
  PluginAlreadyInstalledError,
  InvalidManifestError,
  pluginLifecycleService,
  PluginNotFoundError,
} from '@kombuse/services'
import { pluginsRepository } from '@kombuse/persistence'
import {
  pluginExportSchema,
  pluginInstallSchema,
  pluginUpdateSchema,
  pluginFiltersSchema,
  availablePluginsSchema,
  pluginUninstallQuerySchema,
} from '../schemas/plugins'

export async function pluginRoutes(fastify: FastifyInstance) {
  // Existing: Export a plugin package
  fastify.post('/plugins/export', async (request, reply) => {
    const parseResult = pluginExportSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const result = pluginExportService.exportPackage(parseResult.data)
      return result
    } catch (error) {
      if (error instanceof PackageExistsError) {
        return reply.status(409).send({
          error: 'package_exists',
          directory: error.directory,
        })
      }

      const message = (error as Error).message
      if (
        message.includes('EACCES') ||
        message.includes('EPERM') ||
        message.includes('EROFS')
      ) {
        return reply.status(403).send({
          error: `Cannot write to directory: ${message}`,
        })
      }
      throw error
    }
  })

  // Install a plugin from a package path
  fastify.post('/plugins/install', async (request, reply) => {
    const parseResult = pluginInstallSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      const result = pluginImportService.installPackage(parseResult.data)
      return reply.status(201).send(result)
    } catch (error) {
      if (error instanceof PluginAlreadyInstalledError) {
        return reply.status(409).send({
          error: 'plugin_already_installed',
          plugin_name: error.pluginName,
        })
      }
      if (error instanceof InvalidManifestError) {
        return reply.status(400).send({ error: error.message })
      }
      throw error
    }
  })

  // List installed plugins
  fastify.get('/plugins', async (request, reply) => {
    const parseResult = pluginFiltersSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return pluginsRepository.list(parseResult.data)
  })

  // List available plugins from disk
  fastify.get('/plugins/available', async (request, reply) => {
    const parseResult = availablePluginsSchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    return pluginLifecycleService.getAvailablePlugins(parseResult.data.project_id)
  })

  // Get a single plugin
  fastify.get('/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const plugin = pluginsRepository.get(id)
    if (!plugin) {
      return reply.status(404).send({ error: 'Plugin not found' })
    }
    return plugin
  })

  // Update a plugin (enable/disable)
  fastify.patch('/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parseResult = pluginUpdateSchema.safeParse(request.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }

    try {
      if (parseResult.data.is_enabled === true) {
        return pluginLifecycleService.enablePlugin(id)
      } else if (parseResult.data.is_enabled === false) {
        return pluginLifecycleService.disablePlugin(id)
      }

      const plugin = pluginsRepository.get(id)
      if (!plugin) {
        return reply.status(404).send({ error: 'Plugin not found' })
      }
      return plugin
    } catch (error) {
      if (error instanceof PluginNotFoundError) {
        return reply.status(404).send({ error: 'Plugin not found' })
      }
      throw error
    }
  })

  // Uninstall a plugin
  fastify.delete('/plugins/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parseResult = pluginUninstallQuerySchema.safeParse(request.query)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.issues })
    }
    const uninstallMode = parseResult.data.mode

    try {
      pluginLifecycleService.uninstallPlugin(id, uninstallMode)
      return reply.status(204).send()
    } catch (error) {
      if (error instanceof PluginNotFoundError) {
        return reply.status(404).send({ error: 'Plugin not found' })
      }
      throw error
    }
  })
}
