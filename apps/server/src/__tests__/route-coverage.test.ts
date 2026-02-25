import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  closeDatabase,
  initializeDatabase,
  setDatabase,
} from '@kombuse/persistence'
import {
  ticketRoutes,
  profileRoutes,
  projectRoutes,
  labelRoutes,
  milestoneRoutes,
  commentRoutes,
  eventRoutes,
  agentRoutes,
  sessionRoutes,
  updateRoutes,
  shellUpdateRoutes,
  attachmentRoutes,
  permissionRoutes,
  databaseRoutes,
  syncRoutes,
  claudeCodeRoutes,
  profileSettingsRoutes,
  codexMcpRoutes,
  claudeCodeMcpRoutes,
  modelRoutes,
  backendStatusRoutes,
  pluginRoutes,
  pluginSourceRoutes,
  analyticsRoutes,
  projectInitRoutes,
} from '../routes'
import {
  getSuccessResponseSchema,
  isNoBodyResponseRoute,
  isStreamResponseRoute,
  getAllRegisteredRouteKeys,
  toRouteKey,
} from '../schemas/route-responses.schema'

describe('route-coverage', () => {
  let app: FastifyInstance
  const collectedRouteKeys: string[] = []

  beforeEach(async () => {
    const db = initializeDatabase(':memory:')
    setDatabase(db)

    collectedRouteKeys.length = 0
    app = Fastify()

    app.addHook('onRoute', (routeOptions) => {
      if (!routeOptions.path.startsWith('/api/')) return
      const methods = Array.isArray(routeOptions.method)
        ? routeOptions.method
        : [routeOptions.method]
      for (const method of methods) {
        if (method === 'HEAD') continue
        collectedRouteKeys.push(toRouteKey(method, routeOptions.path))
      }
    })

    // Register all 25 route modules — same as index.ts lines 160-184
    app.register(ticketRoutes, { prefix: '/api' })
    app.register(profileRoutes, { prefix: '/api' })
    app.register(projectRoutes, { prefix: '/api' })
    app.register(labelRoutes, { prefix: '/api' })
    app.register(milestoneRoutes, { prefix: '/api' })
    app.register(commentRoutes, { prefix: '/api' })
    app.register(eventRoutes, { prefix: '/api' })
    app.register(agentRoutes, { prefix: '/api' })
    app.register(sessionRoutes, { prefix: '/api' })
    app.register(updateRoutes, { prefix: '/api' })
    app.register(shellUpdateRoutes, { prefix: '/api' })
    app.register(attachmentRoutes, { prefix: '/api' })
    app.register(permissionRoutes, { prefix: '/api' })
    app.register(databaseRoutes, { prefix: '/api' })
    app.register(syncRoutes, { prefix: '/api' })
    app.register(claudeCodeRoutes, { prefix: '/api' })
    app.register(profileSettingsRoutes, { prefix: '/api' })
    app.register(codexMcpRoutes, { prefix: '/api' })
    app.register(claudeCodeMcpRoutes, { prefix: '/api' })
    app.register(modelRoutes, { prefix: '/api' })
    app.register(backendStatusRoutes, { prefix: '/api' })
    app.register(pluginRoutes, { prefix: '/api' })
    app.register(pluginSourceRoutes, { prefix: '/api' })
    app.register(analyticsRoutes, { prefix: '/api' })
    app.register(projectInitRoutes, { prefix: '/api' })

    await app.ready()
  })

  afterEach(async () => {
    await app.close()
    closeDatabase()
  })

  it('every API route has a response schema registered', () => {
    expect(collectedRouteKeys.length).toBeGreaterThan(0)

    const missing = collectedRouteKeys.filter((routeKey) => {
      return (
        !getSuccessResponseSchema(routeKey) &&
        !isNoBodyResponseRoute(routeKey) &&
        !isStreamResponseRoute(routeKey)
      )
    })

    expect(
      missing,
      `Missing response schema registration in route-responses.schema.ts for:\n${missing.map((k) => `  - ${k}`).join('\n')}\n\nAdd a registerSuccessSchema(), noBodyResponseRouteKeys, or streamResponseRouteKeys entry for each.`
    ).toEqual([])
  })

  it('every registered schema maps to an actual route (no stale entries)', () => {
    const registeredKeys = getAllRegisteredRouteKeys()
    const actualRouteKeySet = new Set(collectedRouteKeys)

    // Desktop routes are registered by the Electron shell, not the server route modules
    const stale = [...registeredKeys].filter((key) => {
      if (key.includes('/api/desktop/')) return false
      return !actualRouteKeySet.has(key)
    })

    expect(
      stale,
      `Stale entries in route-responses.schema.ts (route no longer exists):\n${stale.map((k) => `  - ${k}`).join('\n')}\n\nRemove these entries from route-responses.schema.ts.`
    ).toEqual([])
  })
})
