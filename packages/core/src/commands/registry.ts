import type { Command, CommandRegistry } from '@kombuse/types'

/**
 * Creates a new command registry instance.
 * The registry manages command registration, execution, and subscriptions.
 */
export function createCommandRegistry(): CommandRegistry {
  const commands = new Map<string, Command>()
  const listeners = new Set<() => void>()

  // Cache for getAll() to return stable references
  let cachedAll: Command[] | null = null

  const invalidateCache = () => {
    cachedAll = null
  }

  const notify = () => {
    invalidateCache()
    listeners.forEach((fn) => fn())
  }

  return {
    register(command) {
      commands.set(command.id, command)
      notify()
      return () => {
        commands.delete(command.id)
        notify()
      }
    },

    async execute(id, ctx, ...args) {
      const command = commands.get(id)
      if (!command) {
        throw new Error(`Unknown command: ${id}`)
      }
      if (command.when && !command.when(ctx)) {
        throw new Error(`Command not available: ${id}`)
      }
      await command.handler(...args)
    },

    getAll() {
      if (!cachedAll) {
        cachedAll = Array.from(commands.values())
      }
      return cachedAll
    },

    getAvailable(ctx) {
      return this.getAll().filter((cmd) => !cmd.when || cmd.when(ctx))
    },

    get(id) {
      return commands.get(id)
    },

    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
