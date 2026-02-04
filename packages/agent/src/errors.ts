/**
 * @kombuse/agent - Error types
 */

export type ProcessErrorCode =
  | 'SPAWN_FAILED'
  | 'ALREADY_RUNNING'
  | 'NOT_RUNNING'
  | 'WRITE_FAILED'
  | 'KILL_FAILED'

export class ProcessError extends Error {
  readonly code: ProcessErrorCode
  readonly cause?: Error

  constructor(code: ProcessErrorCode, message: string, cause?: Error) {
    super(message)
    this.name = 'ProcessError'
    this.code = code
    this.cause = cause
  }
}

export function createProcessError(
  code: ProcessErrorCode,
  message: string,
  cause?: Error
): ProcessError {
  return new ProcessError(code, message, cause)
}
