/**
 * Command system types for the plugin-ready architecture.
 * These types define the contract for commands, context, and the registry.
 */

/**
 * Context passed to command `when` guards and `execute` calls.
 * Extend this interface as the application grows.
 */
export interface CommandContext {
  currentTicket?: { id: number; status: string } | null
  currentSession?: { id: string } | null
  isGenerating?: boolean
  view?: string | null
  currentProjectId?: string | null
}

/**
 * A command that can be registered and executed via the command palette or keybindings.
 */
export interface Command {
  /** Unique identifier, e.g., 'tickets.create' */
  id: string
  /** Display name shown in command palette, e.g., 'Create Ticket' */
  title: string
  /** Optional description for tooltips */
  description?: string
  /** Category for grouping in command palette, e.g., 'Tickets' */
  category?: string
  /** Lucide icon name, e.g., 'plus' */
  icon?: string
  /** Keybinding using 'mod' for cross-platform, e.g., 'mod+shift+t' */
  keybinding?: string
  /** Context guard - return false to hide/disable the command */
  when?: (ctx: CommandContext) => boolean
  /** Handler function called when command is executed */
  handler: (...args: unknown[]) => void | Promise<void>
}

/**
 * Registry for managing commands. Supports registration, execution, and subscriptions.
 */
export interface CommandRegistry {
  /** Register a command. Returns an unregister function. */
  register(command: Command): () => void
  /** Execute a command by ID with the given context. */
  execute(id: string, ctx: CommandContext, ...args: unknown[]): Promise<void>
  /** Get all registered commands. */
  getAll(): Command[]
  /** Get commands available in the given context (filtered by `when`). */
  getAvailable(ctx: CommandContext): Command[]
  /** Get a single command by ID. */
  get(id: string): Command | undefined
  /** Subscribe to registry changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void
}
