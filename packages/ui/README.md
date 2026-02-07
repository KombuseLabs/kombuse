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
│   ├── sidebar/          - Collapsible sidebar navigation
│   ├── sessions/         - Session list components
│   ├── tickets/          - Ticket components
│   ├── header.tsx
│   └── mode-toggle.tsx
├── hooks/          - React hooks
│   ├── use-command.ts         - Execute specific commands
│   ├── use-commands.ts        - Get all available commands
│   ├── use-command-context.ts - Access command registry
│   ├── use-attachments.ts      - Attachment CRUD hooks
│   ├── use-labels.ts          - Label CRUD hooks
│   └── use-tickets.ts         - Ticket CRUD hooks
├── providers/      - Context providers
│   ├── command-provider.tsx   - Command system provider
│   └── theme-provider.tsx     - Theme provider (next-themes)
└── lib/            - Utilities
    ├── api.ts                 - API client (tickets, comments, labels, attachments)
    ├── ticket-utils.ts        - Shared ticket display utilities (statusColors)
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

Available: `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `Resizable`, `Select`, `Sonner`, `Tabs`, `Textarea`, `Tooltip`

### Resizable Panels

```typescript
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@kombuse/ui/base'

// Horizontal split with drag handle
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel id="list" defaultSize={50} minSize={25}>
    <LeftContent />
  </ResizablePanel>
  <ResizableHandle withHandle />
  <ResizablePanel id="detail" defaultSize={50} minSize={25}>
    <RightContent />
  </ResizablePanel>
</ResizablePanelGroup>
```

Props:
- `ResizablePanelGroup`: `orientation` ("horizontal" | "vertical"), `defaultLayout`, `onLayoutChanged`, `className`
- `ResizablePanel`: `id`, `defaultSize`, `minSize`, `maxSize`, `collapsible`, `collapsedSize`
- `ResizableHandle`: `withHandle` (shows grip icon), `disabled`, `className`

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

```typescript
import { useProfileSearch, useTicketSearch } from '@kombuse/ui/hooks'

// Debounced profile search (agents only) for @mention autocomplete
const { data: profiles, isLoading } = useProfileSearch('clau', { enabled: true })

// Debounced ticket search for #ticket autocomplete
const { data: tickets } = useTicketSearch('fix', { enabled: true })
```

```typescript
import { useSessionByKombuseId } from '@kombuse/ui/hooks'

// Resolve a kombuse session ID (e.g. "trigger-abc123") to its Session object
// Used internally by CommentItem to render session links on agent comments
const { data: session } = useSessionByKombuseId(kombuseSessionId)
```

### Providers

```typescript
import { CommandProvider, ThemeProvider } from '@kombuse/ui/providers'
```

### Components

```typescript
import { CommandPalette, SearchBar, Header, ModeToggle } from '@kombuse/ui/components'

// CommandPalette renders a search bar trigger + popover dropdown
// Place it in the Header's center slot for VS Code-style search
<Header
  center={
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={navigate} />
  }
>
  <NotificationBell />
</Header>

// Header props:
// - center: ReactNode rendered in the center between title and nav
// - children: rendered in the right nav area

// CommandPalette supports #ticket search and navigation
// Type # followed by a number or search term to find tickets
// Includes a SearchBar trigger showing "Search commands and tickets..." with ⌘K badge
import { TicketList, TicketDetail } from '@kombuse/ui/components'
import { LabelBadge, LabelPicker, LabelSelector, LabelForm } from '@kombuse/ui/components'
import { Sidebar, SidebarItem } from '@kombuse/ui/components'
```

### Sidebar Components

```typescript
import { Sidebar, SidebarItem } from '@kombuse/ui/components'
import { Ticket, Bot } from 'lucide-react'

// Collapsible sidebar with navigation items
<Sidebar
  isCollapsed={isCollapsed}
  onCollapsedChange={setIsCollapsed}
  header={<span>Project Name</span>}
>
  <SidebarItem
    icon={<Ticket className="size-4" />}
    label="Tickets"
    to="/projects/123/tickets"
    isCollapsed={isCollapsed}
  />
  <SidebarItem
    icon={<Bot className="size-4" />}
    label="Agents"
    to="/projects/123/agents"
    isCollapsed={isCollapsed}
  />
</Sidebar>
```

Props:
- `Sidebar`: `isCollapsed`, `onCollapsedChange`, `header`, `children`, `className`
- `SidebarItem`: `icon`, `label`, `to` (React Router path), `isCollapsed`

### Label Components

```typescript
import { LabelBadge, LabelPicker, LabelSelector, LabelForm } from '@kombuse/ui/components'

// Display a colored label badge
<LabelBadge label={label} onRemove={() => handleRemove(label.id)} />

// Single-select dropdown for picking one label (used in trigger conditions)
<LabelPicker
  availableLabels={projectLabels}
  selectedLabelId={selectedId}
  onSelect={(labelId) => setSelectedId(labelId)}
  onLabelCreate={(data) => createLabel(data)}  // Optional: enables inline creation
  placeholder="Select a label..."
/>

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

### Trigger Components

```typescript
import { TriggerEditor, TriggerForm, TriggerList, TriggerItem } from '@kombuse/ui/components'
import { MentionTypePicker, getMentionTypeLabel } from '@kombuse/ui/components'

// Mention type picker for trigger conditions (select between @profile and #ticket)
<MentionTypePicker
  value={selectedMentionType}
  onValueChange={(type) => setSelectedMentionType(type)}
  disabled={false}
/>

// Get human-readable label for a mention type
getMentionTypeLabel('profile') // => "Profile mention (@)"
getMentionTypeLabel('ticket')  // => "Ticket mention (#)"
```

Props for `MentionTypePicker`:
- `value`: `MentionType | null` — current selection
- `onValueChange`: `(value: MentionType) => void` — selection callback
- `disabled`: Optional boolean

### Markdown

```typescript
import { Markdown } from '@kombuse/ui/components'

// Basic markdown rendering
<Markdown>{'# Hello **world**'}</Markdown>

// With ticket link support (#22 → clickable link to /projects/:id/tickets/22)
<Markdown projectId="my-project">{'See #22 for details'}</Markdown>

// @mentions are automatically styled (e.g., @AgentName renders as highlighted text)
<Markdown>{'Ask @CodingAgent to implement this'}</Markdown>
```

Props:
- `children`: Markdown string to render
- `className`: Optional class name
- `projectId`: Optional project ID — when provided, `#<number>` patterns in text are rendered as SPA-navigable links to the corresponding ticket

### Ticket Components

```typescript
import { TicketList, TicketDetail } from '@kombuse/ui/components'

// Display ticket details with optional editing
<TicketDetail
  onClose={() => setSelectedTicket(null)}
  isEditable={true}
/>
```

Props:
- `className`: Optional class name for styling
- `onClose`: Callback when close button is clicked
- `isEditable`: When `true`, enables:
  - Edit button to toggle edit mode (title, description, status)
  - Delete button
  - Label management

### Session Components

```typescript
import { SessionItem, SessionList } from '@kombuse/ui/components'

// Render a list of sessions with selection, delete, and status indicators
<SessionList
  sessions={sessions}
  selectedSessionId={selectedId}
  onSessionClick={(session) => navigate(`/chats/${session.id}`)}
  onSessionDelete={(session) => deleteSession(session.id)}
  isSessionPendingPermission={(id) => hasPendingPermission(id)}
  isLoading={isLoading}
/>
```

`SessionItem` props:
- `session`: `Session` object
- `isSelected`: Whether this item is visually selected
- `onClick`: Click handler
- `onDelete`: Delete handler (shows confirmation dialog)
- `hasPendingPermission`: Shows orange pulsing indicator when true

`SessionList` props:
- `sessions`: `Session[]` to render
- `className`: Optional class name
- `selectedSessionId`: ID of the currently selected session
- `onSessionClick`: `(session: Session) => void`
- `onSessionDelete`: `(session: Session) => void`
- `isSessionPendingPermission`: `(kombuseSessionId: string | null) => boolean`
- `isLoading`: Shows loading state
- `emptyMessage`: Custom empty state text (default: "No sessions yet")

### Chat Components

```typescript
import { Chat, SessionHeader, SessionViewer } from '@kombuse/ui/components'
import type { ViewMode } from '@kombuse/ui/components'
```

`SessionHeader` props:
- `isConnected`, `isLoading`: Status indicators
- `eventCount`: Number of displayed events
- `lastEventTime`: Timestamp of last event
- `viewMode`: `'clean' | 'normal'` — controls display mode toggle state
- `onViewModeChange`: Callback when toggle is switched
- `sessionId`: Optional kombuse session ID string (e.g. `"chat-abc123..."`) — displayed as a truncated monospace label with click-to-copy for debugging

`SessionViewer` props:
- `events`: `SerializedAgentEvent[]` to render
- `isLoading`, `emptyMessage`: Loading/empty states
- `viewMode`: `'clean' | 'normal'` (default `'normal'`) — in `'clean'` mode, only `message` events are shown; tool uses, permission requests, and raw events are hidden
- Auto-scrolls to bottom when new events arrive (if already at bottom)
- Shows a floating scroll-to-bottom button when the user scrolls up

`Chat` manages `viewMode` state internally and passes it to both `SessionHeader` and `SessionViewer`.

### Timeline Components

```typescript
import { ActivityTimeline, CommentItem } from '@kombuse/ui/components'
import { useTicketTimeline } from '@kombuse/ui/hooks'

// Fetch unified timeline (comments + events)
const { data: timeline } = useTicketTimeline(ticketId)

// Render unified activity timeline
<ActivityTimeline
  items={timeline?.items ?? []}
  editingCommentId={editingId}
  editBody={body}
  onEditBodyChange={setBody}
  onStartEditComment={(comment) => ...}
  onSaveEditComment={() => ...}
  onCancelEditComment={() => ...}
  onDeleteComment={(id) => ...}
  onReplyComment={(comment) => ...}
  isUpdatingComment={isUpdating}
  isDeletingComment={isDeleting}
/>

// Render individual comment with edit/delete/reply
<CommentItem
  comment={comment}
  isEditing={false}
  onStartEdit={() => ...}
  onDelete={() => ...}
  onReply={() => ...}
/>

// ChatInput with reply mode
<ChatInput
  onSubmit={handleSubmit}
  placeholder="Add a comment..."
  replyTarget={{ commentId: 1, authorId: 'user-1', isAgentSession: true }}
  onCancelReply={() => setReplyTarget(null)}
/>
```

Props for `ActivityTimeline`:
- `items`: Array of `TimelineItem` (from `/tickets/:id/timeline` API)
- `projectId`: Optional project ID — passed through to `CommentItem` → `Markdown` for ticket link rendering
- `attachmentsByCommentId`: Optional `Record<number, Attachment[]>` mapping comment IDs to their attachments
- `editingCommentId`: ID of comment being edited (or null)
- `editBody`: Current edit text value
- `onEditBodyChange`: Callback when edit text changes
- `onStartEditComment`: Callback when edit button clicked
- `onSaveEditComment`: Callback to save edited comment
- `onCancelEditComment`: Callback to cancel editing
- `onDeleteComment`: Callback to delete a comment
- `onReplyComment`: Callback when reply button clicked on a comment
- `isUpdatingComment`, `isDeletingComment`: Loading states

Props for `CommentItem`:
- `comment`: `CommentWithAuthor` object
- `projectId`: Optional project ID — enables `#<number>` ticket link rendering in comment body and builds correct route for session links on agent comments
- `attachments`: Optional `Attachment[]` to display as inline image thumbnails below the comment body — clicking a thumbnail opens the image lightbox

### Image Lightbox

```typescript
import { ImageLightbox } from '@kombuse/ui/components'

// Full-screen image viewer with navigation
<ImageLightbox
  attachments={attachments}
  initialIndex={0}
  open={lightboxOpen}
  onOpenChange={setLightboxOpen}
/>
```

Props for `ImageLightbox`:
- `attachments`: `Attachment[]` — list of attachments (automatically filters to image types)
- `initialIndex`: Index of the image to show first when opened
- `open`: Whether the lightbox is visible
- `onOpenChange`: Callback when open state changes (close via Escape key, close button, or overlay click)
- Keyboard navigation: ArrowLeft/ArrowRight to navigate between images, Escape to close
- Shows filename, image counter (e.g. "2 / 5"), and download link in footer

Props for `ChatInput`:
- `onSubmit`: Callback `(message: string, files?: File[]) => void` — receives message text and optional staged files
- `placeholder`: Input placeholder text
- `isLoading`, `disabled`: Loading/disabled states
- `replyTarget`: Optional `ReplyTarget` object (`{ commentId, authorId, isAgentSession }`) — shows reply indicator when set
- `onCancelReply`: Callback to dismiss reply mode
- Supports file attachments via paperclip button and drag-and-drop (images only, max 10 MB)
- Supports `@mention` autocomplete — typing `@` triggers a dropdown of agent profiles with keyboard navigation (Arrow keys, Enter/Tab to select, Escape to dismiss)
- Supports `#ticket` autocomplete — typing `#` triggers a dropdown of matching tickets (by title or ID) with the same keyboard navigation

### Attachment Hooks

```typescript
import {
  useCommentAttachments,
  useCommentsAttachments,
  useUploadAttachment,
  useDeleteAttachment,
} from '@kombuse/ui/hooks'

// Fetch attachments for a single comment
const { data: attachments } = useCommentAttachments(commentId)

// Batch-fetch attachments for multiple comments (parallel queries)
const attachmentsByCommentId = useCommentsAttachments([1, 2, 3])
// Returns Record<number, Attachment[]>

// Upload a file to a comment
const upload = useUploadAttachment()
upload.mutateAsync({ commentId: 1, file: myFile, uploadedById: 'user-1' })

// Delete an attachment
const remove = useDeleteAttachment()
remove.mutate({ id: attachmentId, commentId: 1 })
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

```typescript
import { statusColors } from '@kombuse/ui/lib/ticket-utils'

// Tailwind class map for ticket status badges (supports dark mode)
// Keys: 'open', 'in_progress', 'blocked', 'closed'
cn('rounded-full px-1.5 text-[10px] font-medium', statusColors[ticket.status])
```

```typescript
import { extractPermissionDetail } from '@kombuse/ui/lib/permission-utils'

// Extract tool-specific raw detail from a permission request's input
const detail = extractPermissionDetail('Bash', { command: 'git checkout main', description: 'Checkout main' })
// => { label: 'Command', value: 'git checkout main' }

// Supported tools: Bash (command), Read/Write/Edit (file_path),
// Grep/Glob (pattern + path), WebFetch (url)
// Falls back to JSON of input for unknown tools
// Returns null if detail matches description or no meaningful detail exists
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
