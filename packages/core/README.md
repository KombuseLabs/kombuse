# @kombuse/core

Core logic package for Kombuse. Framework-agnostic, no React dependency.

## Command Registry

A plugin-ready command system for building command palettes, keybindings, and menus.

### Usage

```typescript
import { createCommandRegistry } from '@kombuse/core'
import type { Command, CommandContext } from '@kombuse/types'

const registry = createCommandRegistry()

// Register a command
const unregister = registry.register({
  id: 'theme.toggle',
  title: 'Toggle Dark Mode',
  category: 'Theme',
  keybinding: 'mod+shift+d',
  handler: () => toggleTheme()
})

// Execute a command
const context: CommandContext = { view: 'home' }
await registry.execute('theme.toggle', context)

// Unregister when done
unregister()
```

### Command Interface

```typescript
interface Command {
  id: string           // Unique ID: 'tickets.create'
  title: string        // Display name: 'Create Ticket'
  description?: string // Tooltip text
  category?: string    // Grouping: 'Tickets'
  icon?: string        // Lucide icon name
  keybinding?: string  // 'mod+shift+t' (cross-platform)
  when?: (ctx: CommandContext) => boolean  // Context guard
  handler: (...args: unknown[]) => void | Promise<void>
}
```

### Keybinding Utilities

```typescript
import {
  isMacPlatform,
  normalizeKeybinding,
  eventToKeybinding,
  formatKeybinding
} from '@kombuse/core'

// Platform detection
isMacPlatform() // true on Mac, false on Windows/Linux

// Normalize 'mod' to platform-specific key
normalizeKeybinding('mod+k')
// Mac: 'meta+k', Windows: 'ctrl+k'

// Convert KeyboardEvent to string
eventToKeybinding(event)
// 'meta+shift+k'

// Format for display
formatKeybinding('mod+shift+k')
// Mac: '⌘⇧K', Windows: 'Ctrl+Shift+K'
```

### React Integration

See `@kombuse/ui` for React hooks and components:

- `CommandProvider` - Context provider
- `useCommands()` - Get available commands
- `useCommand(id)` - Execute a specific command
- `CommandPalette` - Ready-to-use palette component
