/**
 * @kombuse/agent - Process abstraction
 *
 * Wraps Bun.spawn or Node.js child_process for spawning and controlling binaries.
 */

import type {
  SpawnOptions,
  ProcessCallbacks,
  ProcessStatus,
  ProcessInfo,
  ProcessBehavior,
  Process as IProcess,
} from '../types'
import { createProcessError } from '../errors'
import { createAppLogger } from '@kombuse/core/logger'

const logger = createAppLogger('Process')

// Detect Bun runtime
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== 'undefined'

/**
 * Managed process instance
 */
export class Process implements IProcess {
  readonly id: string
  readonly name: string
  readonly command: string
  readonly args: string[]
  readonly cwd: string
  readonly createdAt: Date

  private _alias: string | undefined
  private _status: ProcessStatus = { state: 'pending' }
  private _pid: number | null = null
  private _subprocess: unknown // Bun.Subprocess or ChildProcess
  private _callbacks: ProcessCallbacks
  private _behaviors: ProcessBehavior[]
  private _options: SpawnOptions
  private _abortController: AbortController

  constructor(
    options: SpawnOptions,
    callbacks: ProcessCallbacks = {},
    behaviors: ProcessBehavior[] = []
  ) {
    this.id = crypto.randomUUID()
    this.name = options.name || options.command.split('/').pop() || 'process'
    this.command = options.command
    this.args = options.args || []
    this.cwd = options.cwd || process.cwd()
    this.createdAt = new Date()
    this._alias = options.alias
    this._callbacks = callbacks
    this._behaviors = behaviors
    this._options = options
    this._abortController = new AbortController()

    // Link external abort signal if provided
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        this._abortController.abort()
        this.kill('SIGTERM')
      })
    }
  }

  get pid(): number | null {
    return this._pid
  }

  get alias(): string | undefined {
    return this._alias
  }

  set alias(value: string | undefined) {
    this._alias = value
  }

  get status(): ProcessStatus {
    return this._status
  }

  get isRunning(): boolean {
    return this._status.state === 'running'
  }

  get options(): SpawnOptions {
    return this._options
  }

  get callbacks(): ProcessCallbacks {
    return this._callbacks
  }

  /**
   * Spawn the process
   */
  async spawn(): Promise<void> {
    if (this._status.state === 'running') {
      throw createProcessError('ALREADY_RUNNING', 'Process is already running')
    }

    // Apply behaviors' onBeforeSpawn
    let options = { ...this._options }
    for (const behavior of this._behaviors) {
      if (behavior.onBeforeSpawn) {
        options = behavior.onBeforeSpawn(options)
      }
    }

    const env =
      options.inheritEnv !== false
        ? { ...process.env, ...options.env }
        : options.env || {}

    logger.info('Spawning process', { command: options.command, cwd: options.cwd, runtime: isBun ? 'bun' : 'node' })

    try {
      if (isBun) {
        await this._spawnBun(options, env as Record<string, string>)
      } else {
        await this._spawnNode(options, env)
      }

      // Notify behaviors of successful spawn
      for (const behavior of this._behaviors) {
        behavior.onAfterSpawn?.(this)
      }
    } catch (err) {
      const error = createProcessError(
        'SPAWN_FAILED',
        `Failed to spawn ${this.command}: ${err instanceof Error ? err.message : String(err)}`,
        err instanceof Error ? err : undefined
      )
      logger.error('Process spawn failed', { command: this.command, error: error.message })
      this._status = { state: 'error', error }
      this._callbacks.onError?.(error)
      for (const behavior of this._behaviors) {
        behavior.onError?.(error, this)
      }
      throw error
    }
  }

  /**
   * Write data to stdin
   */
  write(data: string): void {
    if (!this.isRunning) {
      throw createProcessError('NOT_RUNNING', 'Process is not running')
    }
    this._writeToStdin(data)
  }

  /**
   * Write a line to stdin (appends newline)
   */
  writeLine(data: string): void {
    this.write(data + '\n')
  }

  /**
   * Kill the process
   */
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    if (!this.isRunning || !this._subprocess) {
      return false
    }

    // Check behaviors' onBeforeKill
    for (const behavior of this._behaviors) {
      if (behavior.onBeforeKill && behavior.onBeforeKill(signal, this) === false) {
        return false
      }
    }

    try {
      this._killProcess(signal)
      this._status = {
        state: 'killed',
        pid: this._pid!,
        signal,
        killedAt: new Date(),
      }
      return true
    } catch {
      return false
    }
  }

  /**
   * Get process info for external use
   */
  getInfo(): ProcessInfo {
    return {
      id: this.id,
      pid: this._pid || 0,
      name: this.name,
      alias: this._alias,
      command: this.command,
      args: this.args,
      cwd: this.cwd,
      status: this._status,
      createdAt: this.createdAt,
    }
  }

  // Private implementation methods

  private async _spawnBun(
    options: SpawnOptions,
    env: Record<string, string>
  ): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Bun = (globalThis as any).Bun
    const subprocess = Bun.spawn([options.command, ...(options.args || [])], {
      cwd: options.cwd,
      env,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    })

    this._subprocess = subprocess
    this._pid = subprocess.pid
    logger.info('Process spawned (bun)', { pid: subprocess.pid })
    this._status = {
      state: 'running',
      pid: subprocess.pid,
      startedAt: new Date(),
    }
    this._callbacks.onSpawn?.(subprocess.pid)

    // Stream stdout/stderr and wait for both streams to drain before firing exit callbacks.
    // This prevents a race where subprocess.exited resolves before buffered output is read.
    const stdoutDone = this._streamBunOutput(subprocess.stdout, 'stdout')
    const stderrDone = this._streamBunOutput(subprocess.stderr, 'stderr')

    Promise.all([stdoutDone, stderrDone, subprocess.exited]).then(([,, code]) => {
      const signal = null // Bun doesn't provide signal info on normal exit
      logger.info('Process exited (bun)', { pid: this._pid, code, signal })
      this._status = {
        state: 'exited',
        pid: this._pid!,
        code,
        signal,
        exitedAt: new Date(),
      }
      this._callbacks.onExit?.(code, signal)
      for (const behavior of this._behaviors) {
        behavior.onExit?.(code, signal, this)
      }
    }).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('Process error (bun)', { pid: this._pid, error: error.message })
      this._status = { state: 'error', error }
      this._callbacks.onError?.(error)
      for (const behavior of this._behaviors) {
        behavior.onError?.(error, this)
      }
    })
  }

  private async _spawnNode(
    options: SpawnOptions,
    env: Record<string, string | undefined>
  ): Promise<void> {
    const { spawn } = await import('node:child_process')

    const child = spawn(options.command, options.args || [], {
      cwd: options.cwd,
      env: env as NodeJS.ProcessEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this._subprocess = child
    this._pid = child.pid || 0
    logger.info('Process spawned (node)', { pid: this._pid })
    this._status = { state: 'running', pid: this._pid, startedAt: new Date() }
    this._callbacks.onSpawn?.(this._pid)

    child.stdout?.on('data', (data: Buffer) => {
      this._handleStdout(data.toString())
    })

    child.stderr?.on('data', (data: Buffer) => {
      this._handleStderr(data.toString())
    })

    child.on('close', (code, signal) => {
      logger.info('Process exited (node)', { pid: this._pid, code, signal })
      this._status = {
        state: 'exited',
        pid: this._pid!,
        code,
        signal,
        exitedAt: new Date(),
      }
      this._callbacks.onExit?.(code, signal)
      for (const behavior of this._behaviors) {
        behavior.onExit?.(code, signal, this)
      }
    })

    child.on('error', (err) => {
      const error = createProcessError('SPAWN_FAILED', err.message, err)
      logger.error('Process error (node)', { pid: this._pid, error: error.message })
      this._status = { state: 'error', error }
      this._callbacks.onError?.(error)
      for (const behavior of this._behaviors) {
        behavior.onError?.(error, this)
      }
    })
  }

  private async _streamBunOutput(
    readable: ReadableStream<Uint8Array>,
    type: 'stdout' | 'stderr'
  ): Promise<void> {
    const reader = readable.getReader()
    const decoder = new TextDecoder()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        if (type === 'stdout') {
          this._handleStdout(text)
        } else {
          this._handleStderr(text)
        }
      }
    } catch (err) {
      // Stream closure after process exit is expected.
      // Only report genuine errors while the process is still running.
      if (this._status.state === 'running') {
        const error = err instanceof Error ? err : new Error('Stream closed unexpectedly')
        this._status = { state: 'error', error }
        this._callbacks.onError?.(error)
        for (const behavior of this._behaviors) {
          behavior.onError?.(error, this)
        }
      }
    }
  }

  private _handleStdout(data: string): void {
    let output: string | void = data
    for (const behavior of this._behaviors) {
      if (behavior.onStdout) {
        const result = behavior.onStdout(output || data, this)
        if (result !== undefined) output = result
      }
    }
    this._callbacks.onStdout?.(output || data)
  }

  private _handleStderr(data: string): void {
    let output: string | void = data
    for (const behavior of this._behaviors) {
      if (behavior.onStderr) {
        const result = behavior.onStderr(output || data, this)
        if (result !== undefined) output = result
      }
    }
    this._callbacks.onStderr?.(output || data)
  }

  private _writeToStdin(data: string): void {
    if (isBun) {
      const subprocess = this._subprocess as { stdin: { write: (d: string) => void } }
      subprocess.stdin.write(data)
    } else {
      const child = this._subprocess as { stdin: NodeJS.WritableStream }
      child.stdin.write(data)
    }
  }

  private _killProcess(signal: NodeJS.Signals): void {
    if (isBun) {
      const subprocess = this._subprocess as { kill: (sig?: number) => void }
      // Bun uses signal numbers
      const sigNum = signal === 'SIGTERM' ? 15 : signal === 'SIGKILL' ? 9 : 15
      subprocess.kill(sigNum)
    } else {
      const child = this._subprocess as { kill: (sig: string) => boolean }
      child.kill(signal)
    }
  }
}

/**
 * Spawn a process with callbacks (convenience function)
 */
export function spawn(
  options: SpawnOptions,
  callbacks?: ProcessCallbacks,
  behaviors?: ProcessBehavior[]
): Process {
  const proc = new Process(options, callbacks, behaviors)
  proc.spawn().catch(() => {
    // Error handled via callbacks
  })
  return proc
}

/**
 * Create a process with behaviors (factory for composition)
 */
export function createProcess(
  options: SpawnOptions,
  behaviors: ProcessBehavior[],
  callbacks?: ProcessCallbacks
): Process {
  return new Process(options, callbacks, behaviors)
}

/**
 * Wait for a process to be in running state.
 * Process.spawn() returns immediately before the process actually starts.
 */
export async function waitForRunning(process: Process, timeoutMs = 5000): Promise<void> {
  const startTime = Date.now()
  while (!process.isRunning) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Timeout waiting for process to start')
    }
    // Check process status - if it exited or errored, throw
    const status = process.status
    if (status.state === 'exited' || status.state === 'error') {
      throw new Error(`Process failed to start: ${status.state}`)
    }
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
