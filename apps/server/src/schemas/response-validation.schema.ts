import { Readable } from 'node:stream'
import type { FastifyRequest, preSerializationHookHandler } from 'fastify'
import { z } from 'zod'
import {
  apiErrorSchema,
  validationErrorDetailsSchema,
} from '@kombuse/types/schemas'
import {
  getSuccessResponseSchema,
  isNoBodyResponseRoute,
  isStreamResponseRoute,
  toRouteKey,
} from './route-responses.schema'

type SuccessSchemaResolver = (routeKey: string) => z.ZodTypeAny | undefined
type RoutePredicate = (routeKey: string) => boolean

export interface ResponseValidationHookOptions {
  resolveSuccessSchema?: SuccessSchemaResolver
  isNoBodyRoute?: RoutePredicate
  isStreamRoute?: RoutePredicate
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStreamPayload(payload: unknown): boolean {
  if (payload instanceof Readable) {
    return true
  }

  if (!isRecord(payload)) {
    return false
  }

  return (
    typeof payload.pipe === 'function'
    || typeof payload.getReader === 'function'
  )
}

function normalizeRoutePath(request: FastifyRequest): string {
  const routePath = request.routeOptions?.url
  if (typeof routePath === 'string' && routePath.length > 0) {
    if (routePath.startsWith('/api/')) {
      return routePath
    }
    return routePath.startsWith('/')
      ? `/api${routePath}`
      : `/api/${routePath}`
  }

  return request.url.split('?')[0] ?? request.url
}

function toValidationDetails(
  issues: unknown
): z.infer<typeof validationErrorDetailsSchema> | undefined {
  const issueArray = Array.isArray(issues)
    ? issues
    : isRecord(issues) && Array.isArray(issues.issues)
      ? issues.issues
      : null

  if (!issueArray || issueArray.length === 0) {
    return undefined
  }

  const normalizedIssues = issueArray
    .map((issue) => {
      if (!isRecord(issue)) {
        return null
      }

      const rawPath = Array.isArray(issue.path) ? issue.path : []
      const path = rawPath.map((segment) =>
        typeof segment === 'number' ? segment : String(segment)
      )

      return {
        path,
        message:
          typeof issue.message === 'string' && issue.message.length > 0
            ? issue.message
            : 'Invalid value',
        code:
          typeof issue.code === 'string' && issue.code.length > 0
            ? issue.code
            : 'invalid_value',
      }
    })
    .filter((issue): issue is { path: Array<string | number>; message: string; code: string } => {
      return issue !== null
    })

  if (normalizedIssues.length === 0) {
    return undefined
  }

  const parsed = validationErrorDetailsSchema.safeParse({
    issues: normalizedIssues,
  })

  return parsed.success ? parsed.data : undefined
}

function mergeDetails(current: unknown, next: unknown): unknown {
  if (current === undefined) {
    return next
  }
  if (next === undefined) {
    return current
  }

  if (isRecord(current) && isRecord(next)) {
    return { ...current, ...next }
  }

  return { current, next }
}

function buildApiErrorPayload(
  error: string,
  options?: { code?: string; details?: unknown }
): z.infer<typeof apiErrorSchema> {
  const payload = {
    error: error.trim().length > 0 ? error : 'Request failed',
    ...(options?.code ? { code: options.code } : {}),
    ...(options?.details !== undefined ? { details: options.details } : {}),
  }

  const parsed = apiErrorSchema.safeParse(payload)
  if (parsed.success) {
    return parsed.data
  }

  return { error: 'Request failed' }
}

function normalizeErrorPayload(
  payload: unknown,
  statusCode: number
): z.infer<typeof apiErrorSchema> {
  const fallbackMessage = statusCode === 400 ? 'Validation failed' : 'Request failed'

  let error = fallbackMessage
  let code: string | undefined
  let details: unknown

  if (isRecord(payload)) {
    if (typeof payload.error === 'string' && payload.error.trim().length > 0) {
      error = payload.error
    } else if (payload.error !== undefined) {
      details = payload.error
    }

    if (typeof payload.code === 'string' && payload.code.trim().length > 0) {
      code = payload.code
    }

    if (payload.details !== undefined) {
      details = mergeDetails(details, payload.details)
    }

    const extras = Object.fromEntries(
      Object.entries(payload).filter(([key]) =>
        key !== 'error' && key !== 'code' && key !== 'details'
      )
    )
    if (Object.keys(extras).length > 0) {
      details = mergeDetails(details, extras)
    }
  } else if (typeof payload === 'string' && payload.trim().length > 0) {
    error = payload
  }

  const validationDetails = toValidationDetails(details)
  if (statusCode === 400 && validationDetails) {
    error = 'Validation failed'
    code = code ?? 'VALIDATION_ERROR'
    details = validationDetails
  }

  return buildApiErrorPayload(error, { code, details })
}

function normalizeZodIssues(issues: z.ZodIssue[]) {
  const details = toValidationDetails(
    issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    }))
  )

  return details ?? { issues }
}

export function createResponseValidationHook(
  options: ResponseValidationHookOptions = {}
): preSerializationHookHandler {
  const resolveSuccessSchema = options.resolveSuccessSchema ?? getSuccessResponseSchema
  const isNoBodyRoute = options.isNoBodyRoute ?? isNoBodyResponseRoute
  const isStreamRoute = options.isStreamRoute ?? isStreamResponseRoute

  return async function responseValidationHook(request, reply, payload) {
    const requestPath = request.url.split('?')[0] ?? request.url
    if (!requestPath.startsWith('/api/')) {
      return payload
    }

    const routePath = normalizeRoutePath(request)
    const routeKey = toRouteKey(request.method, routePath)

    if (reply.statusCode >= 400) {
      // Keep non-JSON error payloads untouched.
      if (isStreamPayload(payload)) {
        return payload
      }
      return normalizeErrorPayload(payload, reply.statusCode)
    }

    // Explicitly bypass success validation for stream responses and no-body routes.
    if (reply.statusCode === 204 || isNoBodyRoute(routeKey)) {
      return payload
    }
    if (isStreamRoute(routeKey) || isStreamPayload(payload)) {
      return payload
    }

    const successSchema = resolveSuccessSchema(routeKey)
    if (!successSchema) {
      reply.code(500)
      return buildApiErrorPayload('Response validation failed', {
        code: 'RESPONSE_SCHEMA_MISSING',
        details: { route: routeKey },
      })
    }

    const parsed = successSchema.safeParse(payload)
    if (!parsed.success) {
      reply.code(500)
      return buildApiErrorPayload('Response validation failed', {
        code: 'RESPONSE_VALIDATION_ERROR',
        details: {
          route: routeKey,
          ...normalizeZodIssues(parsed.error.issues),
        },
      })
    }

    return parsed.data
  }
}
