import { describe, it, expect } from 'vitest'
import { Process } from '../utils/process'

describe('Process stream drain', () => {
  it('fires onExit after all stdout data has been delivered via onStdout', async () => {
    const stdoutChunks: string[] = []
    let exitCode: number | null = null
    let stdoutBeforeExit = false

    const process = new Process(
      {
        command: 'echo',
        args: ['hello world'],
        cwd: '.',
        name: 'drain-test',
      },
      {
        onStdout: (data) => {
          stdoutChunks.push(data)
        },
        onExit: (code) => {
          exitCode = code
          // At the point onExit fires, stdout should already have data
          stdoutBeforeExit = stdoutChunks.length > 0
        },
      }
    )

    await process.spawn()

    // Wait for process to complete
    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const status = process.status
        if (status.state === 'exited' || status.state === 'error') {
          clearInterval(interval)
          resolve()
        }
      }, 10)
    })

    expect(exitCode).toBe(0)
    expect(stdoutChunks.join('')).toContain('hello world')
    expect(stdoutBeforeExit).toBe(true)
  })

  it('fires onExit after all stdout data when process outputs multiple lines', async () => {
    const stdoutChunks: string[] = []
    let stdoutAtExit = ''

    const process = new Process(
      {
        command: 'printf',
        args: ['line1\\nline2\\nline3\\n'],
        cwd: '.',
        name: 'multiline-drain-test',
      },
      {
        onStdout: (data) => {
          stdoutChunks.push(data)
        },
        onExit: () => {
          stdoutAtExit = stdoutChunks.join('')
        },
      }
    )

    await process.spawn()

    await new Promise<void>((resolve) => {
      const interval = setInterval(() => {
        const status = process.status
        if (status.state === 'exited' || status.state === 'error') {
          clearInterval(interval)
          resolve()
        }
      }, 10)
    })

    expect(stdoutAtExit).toContain('line1')
    expect(stdoutAtExit).toContain('line2')
    expect(stdoutAtExit).toContain('line3')
  })

  it('fires onError when process fails to spawn', async () => {
    let capturedError: Error | null = null

    const process = new Process(
      {
        command: '/nonexistent/binary/that/does/not/exist',
        args: [],
        cwd: '.',
        name: 'spawn-fail-test',
      },
      {
        onError: (error) => {
          capturedError = error
        },
      }
    )

    try {
      await process.spawn()
    } catch {
      // spawn may throw directly
    }

    // Wait briefly for async error callbacks
    await new Promise((resolve) => setTimeout(resolve, 100))

    const status = process.status
    expect(status.state === 'error' || capturedError !== null).toBe(true)
  })
})
