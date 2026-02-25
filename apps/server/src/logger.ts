// Backwards-compatibility shim — canonical implementation is in @kombuse/core/logger
export {
  createSessionLogger,
  createAppLogger,
  pruneOldLogs,
  closeAppLogger,
  type SessionLogger,
  type SessionLoggerOptions,
  type AppLogger,
  type AppLoggerOptions,
  type LogTarget,
  type LogLevel,
  type AppLogLevel,
  type PruneOptions,
} from '@kombuse/core/logger'
