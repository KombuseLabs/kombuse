export { BACKEND_TYPES } from '@kombuse/types'
export type {
  AgentBackend,
  AgentBackendLifecycleState,
  AgentCompleteEvent,
  AgentCompleteReason,
  AgentErrorEvent,
  AgentEvent,
  AgentEventBase,
  AgentLifecycleEvent,
  AgentMessageEvent,
  AgentMessageRole,
  AgentPermissionRequestEvent,
  PermissionResponseOptions,
  AgentRawEvent,
  AgentToolResultEvent,
  AgentToolUseEvent,
  BackendType,
  ConversationContext,
  PermissionConfig,
  StartOptions,
} from '@kombuse/types'

// ============================================================================
// Process types
// ============================================================================

/**
 * Options for spawning a process
 */
export interface SpawnOptions {
  /** Command to execute */
  command: string
  /** Arguments to pass to the command */
  args?: string[]
  /** Working directory */
  cwd?: string
  /** Environment variables */
  env?: Record<string, string>
  /** Whether to inherit parent environment (default: true) */
  inheritEnv?: boolean
  /** Process name for identification */
  name?: string
  /** Optional alias for the process */
  alias?: string
  /** Abort signal for cancellation */
  signal?: AbortSignal
}

/**
 * Callbacks for process events
 */
export interface ProcessCallbacks {
  onSpawn?: (pid: number) => void
  onStdout?: (data: string) => void
  onStderr?: (data: string) => void
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void
  onError?: (error: Error) => void
}

/**
 * Process status union type
 */
export type ProcessStatus =
  | { state: 'pending' }
  | { state: 'running'; pid: number; startedAt: Date }
  | { state: 'exited'; pid: number; code: number | null; signal: NodeJS.Signals | null; exitedAt: Date }
  | { state: 'killed'; pid: number; signal: NodeJS.Signals; killedAt: Date }
  | { state: 'error'; error: Error }

/**
 * Process info for external use
 */
export interface ProcessInfo {
  id: string
  pid: number
  name: string
  alias?: string
  command: string
  args: string[]
  cwd: string
  status: ProcessStatus
  createdAt: Date
}

/**
 * Process behavior hook for composable process handling
 */
export interface ProcessBehavior {
  /** Called before spawn, can modify options */
  onBeforeSpawn?: (options: SpawnOptions) => SpawnOptions
  /** Called after successful spawn */
  onAfterSpawn?: (process: Process) => void
  /** Called on stdout, can transform output */
  onStdout?: (data: string, process: Process) => string | void
  /** Called on stderr, can transform output */
  onStderr?: (data: string, process: Process) => string | void
  /** Called before kill, return false to prevent */
  onBeforeKill?: (signal: NodeJS.Signals, process: Process) => boolean | void
  /** Called on process exit */
  onExit?: (code: number | null, signal: NodeJS.Signals | null, process: Process) => void
  /** Called on error */
  onError?: (error: Error, process: Process) => void
}

/**
 * Process interface
 */
export interface Process {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly args: string[]
  readonly cwd: string
  readonly createdAt: Date
  readonly pid: number | null
  readonly status: ProcessStatus
  readonly isRunning: boolean
  alias: string | undefined

  spawn(): Promise<void>
  write(data: string): void
  writeLine(data: string): void
  kill(signal?: NodeJS.Signals): boolean
  getInfo(): ProcessInfo
}
