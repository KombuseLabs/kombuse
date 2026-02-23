import type { preHandlerHookHandler } from 'fastify'
import { UUID_REGEX } from '@kombuse/types'
import { projectService } from '@kombuse/services'

export const resolveProjectSlug: preHandlerHookHandler = function resolveProjectSlug(
  request,
  reply,
  done,
) {
  const params = request.params as Record<string, string> | undefined
  if (!params?.projectId) {
    done()
    return
  }

  if (UUID_REGEX.test(params.projectId)) {
    done()
    return
  }

  const project = projectService.getByIdOrSlug(params.projectId)
  if (!project) {
    reply.status(404).send({ error: 'Project not found' })
    return
  }

  params.projectId = project.id
  done()
}
