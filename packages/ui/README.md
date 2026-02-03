# @kombuse/ui

React component library built with shadcn/ui, Radix UI, and Tailwind CSS.

## Installation

This package is internal to the monorepo. Import components in your app:

```typescript
import { Button, Card, Input } from '@kombuse/ui/base'
import { CommandProvider } from '@kombuse/ui/providers'
import { useCommand } from '@kombuse/ui/hooks'
```

## Directory Structure

```
src/
├── base/           - shadcn/ui primitives (button, dialog, badge, popover, etc.)
├── components/     - Domain components
│   ├── command-palette/  - Command palette UI
│   ├── labels/           - Label management components
│   ├── tickets/          - Ticket components
│   ├── header.tsx
│   └── mode-toggle.tsx
├── hooks/          - React hooks
│   ├── use-command.ts         - Execute specific commands
│   ├── use-commands.ts        - Get all available commands
│   ├── use-command-context.ts - Access command registry
│   ├── use-labels.ts          - Label CRUD hooks
│   └── use-tickets.ts         - Ticket CRUD hooks
├── providers/      - Context providers
│   ├── command-provider.tsx   - Command system provider
│   └── theme-provider.tsx     - Theme provider (next-themes)
└── lib/            - Utilities
    ├── api.ts                 - API client (tickets, comments, labels)
    └── utils.ts               - cn() class merging
```

## Exports

### Base Components

Shadcn/ui primitives:

```typescript
import { Button } from '@kombuse/ui/base'
import { Card, CardHeader, CardContent } from '@kombuse/ui/base'
import { Dialog, DialogContent, DialogTrigger } from '@kombuse/ui/base'
import { Input } from '@kombuse/ui/base'
```

Available: `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `Select`, `Sonner`, `Tabs`, `Textarea`, `Tooltip`

### Hooks

```typescript
import { useCommand, useCommands, useCommandContext } from '@kombuse/ui/hooks'

// Execute a specific command
const { execute, command, available } = useCommand('theme.toggle')

// Get all available commands
const commands = useCommands()

// Access registry directly
const { registry, context } = useCommandContext()
```

### Providers

```typescript
import { CommandProvider, ThemeProvider } from '@kombuse/ui/providers'
```

### Components

```typescript
import { CommandPalette, Header, ModeToggle } from '@kombuse/ui/components'
import { TicketList, TicketDetail } from '@kombuse/ui/components'
import { LabelBadge, LabelSelector, LabelForm } from '@kombuse/ui/components'
```

### Label Components

```typescript
import { LabelBadge, LabelSelector, LabelForm } from '@kombuse/ui/components'

// Display a colored label badge
<LabelBadge label={label} onRemove={() => handleRemove(label.id)} />

// Multi-select dropdown for assigning labels (with optional CRUD)
<LabelSelector
  availableLabels={projectLabels}
  selectedLabelIds={[1, 2]}
  onLabelAdd={(labelId) => ...}
  onLabelRemove={(labelId) => ...}
  onLabelCreate={(data) => ...}    // Optional: enables "Create new label"
  onLabelUpdate={(id, data) => ...} // Optional: enables edit button
  onLabelDelete={(id) => ...}       // Optional: enables delete button
/>

// Inline form for creating/editing labels
<LabelForm
  label={existingLabel}  // Optional: for edit mode
  onSubmit={(data) => ...}
  onCancel={() => ...}
/>
```

### Label Hooks

```typescript
import {
  useProjectLabels,
  useTicketLabels,
  useAddLabelToTicket,
  useRemoveLabelFromTicket,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
} from '@kombuse/ui/hooks'

// Fetch labels for a project
const { data: labels } = useProjectLabels('project-id')

// Fetch labels assigned to a ticket
const { data: ticketLabels } = useTicketLabels(ticketId)

// Assign/unassign labels to tickets
const addLabel = useAddLabelToTicket(ticketId)
addLabel.mutate({ labelId: 1 })

const removeLabel = useRemoveLabelFromTicket(ticketId)
removeLabel.mutate(labelId)

// CRUD for labels themselves
const createLabel = useCreateLabel('project-id')
createLabel.mutate({ name: 'bug', color: '#d73a4a' })

const updateLabel = useUpdateLabel('project-id')
updateLabel.mutate({ id: 1, input: { name: 'Bug', color: '#ff0000' } })

const deleteLabel = useDeleteLabel('project-id')
deleteLabel.mutate(labelId)
```

### Utilities

```typescript
import { cn } from '@kombuse/ui/lib/utils'

// Merge class names with tailwind-merge
cn('px-4 py-2', conditional && 'bg-primary', className)
```

### Styles

```typescript
import '@kombuse/ui/globals.css'
```

## Usage Example

```tsx
import { CommandProvider, ThemeProvider } from '@kombuse/ui/providers'
import { CommandPalette } from '@kombuse/ui/components'
import { useCommand } from '@kombuse/ui/hooks'
import { Button } from '@kombuse/ui/base'
import { createCommandRegistry } from '@kombuse/core'

function App() {
  const registry = useMemo(() => createCommandRegistry(), [])
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    registry.register({
      id: 'palette.open',
      title: 'Open Command Palette',
      keybinding: 'mod+k',
      handler: () => setPaletteOpen(true),
    })
  }, [registry])

  return (
    <ThemeProvider attribute="class" defaultTheme="system">
      <CommandProvider registry={registry} context={{ view: 'home' }}>
        <MyComponent />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </CommandProvider>
    </ThemeProvider>
  )
}

function MyComponent() {
  const { execute } = useCommand('palette.open')
  return <Button onClick={() => execute()}>Open Palette</Button>
}
```

## Adding New Components

1. **Base components** (shadcn/ui): Add to `src/base/` and re-export from `src/base/index.ts`
2. **Domain components**: Add to `src/components/` and re-export from `src/components/index.ts`
3. **Hooks**: Add to `src/hooks/` and re-export from `src/hooks/index.ts`
4. **Providers**: Add to `src/providers/` and re-export from `src/providers/index.ts`
