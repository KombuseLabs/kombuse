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
│   ├── agent-picker/     - Agent selector for chat sessions
│   ├── command-palette/  - Command palette UI
│   ├── chat/             - Chat transcript UI and SessionViewer renderers (including generic kombuse MCP tool cards)
│   ├── labels/           - Label management components
│   ├── milestones/       - Milestone management components
│   ├── prompt-editor/    - System prompt editor with template variables
│   ├── sidebar/          - Collapsible sidebar navigation
│   ├── permissions/      - Permission decision log components
│   ├── sessions/         - Session list components
│   ├── tickets/          - Ticket components
│   ├── header.tsx
│   ├── profile-button.tsx       - Header user menu dropdown (Profile + Settings)
│   └── mode-toggle.tsx
├── hooks/          - React hooks
│   ├── use-command.ts         - Execute specific commands
│   ├── use-commands.ts        - Get all available commands
│   ├── use-command-context.ts - Access command registry
│   ├── use-profile.ts           - Current user profile hook
│   ├── use-attachments.ts      - Attachment CRUD hooks
│   ├── use-file-staging.ts     - File staging with validation, previews, drag-and-drop
│   ├── use-scroll-to-bottom.ts - Auto-scroll and floating scroll button hook
│   ├── use-claude-code.ts     - Claude Code project scanner hooks
│   ├── use-desktop.ts         - Electron desktop detection hook
│   ├── use-labels.ts          - Label CRUD hooks
│   ├── use-milestones.ts      - Milestone CRUD hooks
│   ├── use-permissions.ts     - Permission log query hook
│   ├── use-profile-settings.ts - Profile settings read/write hooks (single + all)
│   ├── use-projects.ts        - Project CRUD hooks
│   ├── use-shiki.ts           - Shiki syntax highlighter hook (singleton, lazy-loaded)
│   └── use-tickets.ts         - Ticket CRUD hooks
├── providers/      - Context providers
│   ├── command-provider.tsx   - Command system provider
│   └── theme-provider.tsx     - Theme provider (next-themes)
└── lib/            - Utilities
    ├── api.ts                 - API client (tickets, comments, labels, milestones, attachments, permissions)
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

Available: `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `HoverCard`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `Resizable`, `Select`, `Sonner`, `Tabs`, `Textarea`, `Tooltip`

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
import { useDesktop } from '@kombuse/ui/hooks'

// Detect if running inside the Electron shell
const { isDesktop, platform, selectDirectory } = useDesktop()
// isDesktop: true when window.electron exists
// platform: 'darwin' | 'win32' | 'linux' | null
// selectDirectory: async native directory picker in desktop mode; resolves to `string | null`
```

```typescript
import { useProfile, useCurrentUserProfile } from '@kombuse/ui/hooks'

// Fetch a profile by ID
const { data: profile, isLoading } = useProfile('user-1')

// Fetch the current user's profile (hardcoded to "user-1" until auth is implemented)
const { data: currentUser } = useCurrentUserProfile()
```

```typescript
import { useProfileSetting, useProfileSettings, useUpsertProfileSetting } from '@kombuse/ui/hooks'

// Fetch a single profile setting by key
const { data: setting, isLoading } = useProfileSetting('user-1', 'sidebar.hidden.events')
// setting?.setting_value => "true" | "false"

// Fetch all settings for a profile
const { data: settings } = useProfileSettings('user-1')
// Returns ProfileSetting[]

// Create or update a profile setting
const upsertSetting = useUpsertProfileSetting()
upsertSetting.mutate({
  profile_id: 'user-1',
  setting_key: 'sidebar.hidden.events',
  setting_value: 'false',
})
// Automatically invalidates both single-key and list query keys on success
```

```typescript
import { useProfileSearch, useTicketSearch } from '@kombuse/ui/hooks'

// Debounced profile search (agents only) for @mention autocomplete
const { data: profiles, isLoading } = useProfileSearch('clau', { enabled: true })

// Debounced ticket search for #ticket autocomplete
const { data: tickets } = useTicketSearch('fix', { enabled: true })
```

```typescript
import { useTextareaAutocomplete } from '@kombuse/ui/hooks'

// Add @mention and #ticket autocomplete to any controlled textarea
const textareaRef = useRef<HTMLTextAreaElement>(null)
const { textareaProps, AutocompletePortal } = useTextareaAutocomplete({
  value,
  onValueChange: setValue,
  textareaRef,
})

<Textarea ref={textareaRef} value={value} {...textareaProps} />
<AutocompletePortal />
```

- `textareaProps`: `{ onChange, onKeyDown }` — spread onto the Textarea
- `AutocompletePortal`: Component that renders the autocomplete popovers (profile and ticket)
- Handles mention context detection, debounced search, keyboard navigation (Arrow keys, Enter/Tab, Escape), and mention insertion

```typescript
import { useComment } from '@kombuse/ui/hooks'

// Fetch a single comment by ID (used by CommentMentionChip)
const { data: comment, isLoading } = useComment(commentId)
// Returns CommentWithAuthor (includes author profile)
```

```typescript
import { useSessionByKombuseId } from '@kombuse/ui/hooks'

// Resolve a kombuse session ID (e.g. "trigger-abc123") to its Session object
// Used internally by CommentItem to render session links on agent comments
const { data: session } = useSessionByKombuseId(kombuseSessionId)
```

```typescript
import { useFileStaging, formatFileSize } from '@kombuse/ui/hooks'

// Manage file staging with validation, preview URLs, and drag-and-drop
const {
  stagedFiles, previewUrls, isDragOver, hasFiles,
  addFiles, removeFile, clearFiles,
  dragHandlers,    // { onDragOver, onDragLeave, onDrop } — spread onto drop zone
  handlePaste,     // onPaste for textarea
  fileInputRef, handleFileInputChange,
} = useFileStaging()

// With custom options
const staging = useFileStaging({
  allowedTypes: ['image/png', 'image/jpeg'],
  maxSize: 5 * 1024 * 1024, // 5 MB
})

// Format bytes for display
formatFileSize(1536) // => "1.5 KB"
```

```typescript
import { useScrollToBottom } from '@kombuse/ui/hooks'

// Auto-scroll container with floating scroll navigation button support
const { scrollRef, isAtBottom, isAtTop, scrollToBottom, scrollToTop, onScroll } = useScrollToBottom({
  deps: [items.length],                  // Auto-scroll when these change (if at bottom)
  threshold: 100,                         // Pixels from bottom to consider "at bottom" (default: 100)
  initialScrollOnChange: selectedId,      // Force-scroll when this value changes
  suppressInitialScroll: pendingScrollToComment, // Skip force-scroll when hash-target scroll should win
})

// Attach to scrollable container
<div ref={scrollRef} onScroll={onScroll} className="overflow-y-auto">
  {/* content */}
</div>

// Show floating buttons for scroll navigation
{!isAtTop && <Button onClick={scrollToTop}>↑</Button>}
{!isAtBottom && <Button onClick={scrollToBottom}>↓</Button>}
```

- Used by `SessionViewer` (chat) and the ticket detail view
- `deps`: triggers auto-scroll when values change and user is already at bottom
- `initialScrollOnChange`: forces scroll to bottom when the value changes (e.g. switching tickets)
- `suppressInitialScroll`: when true, skips the initial force-scroll (used when `useScrollToComment` takes priority)

```typescript
import { useScrollToComment } from '@kombuse/ui/hooks'

// Scroll to and highlight a comment targeted by URL hash fragment (e.g. #comment-144)
const { highlightedCommentId, isScrollToCommentPending } = useScrollToComment({
  isTimelineLoaded: (timeline?.items.length ?? 0) > 0,
})
```

- Reads `location.hash` via React Router's `useLocation()` and parses `#comment-{id}`
- Scrolls the target comment into view (`smooth`, `center`) once the timeline is loaded
- Returns `highlightedCommentId` for visual highlight (ring), auto-clears after 3 seconds
- Returns `isScrollToCommentPending` to suppress `useScrollToBottom`'s initial force-scroll
- Handles same-ticket navigation (hash change without page reload) and cross-ticket navigation
- Invalid hashes (anything other than `#comment-{id}`) are treated as idle: no pending state, no scrolling

```typescript
import { useShiki } from '@kombuse/ui/hooks'

// Lazy-load the Shiki syntax highlighter (singleton, shared across all components)
const { ready, highlight } = useShiki()
// ready: boolean — true once the highlighter has loaded
// highlight(code, lang): string | null — returns HTML string or null if not ready
```

Used internally by `Markdown` for fenced code block highlighting. Preloads 16 common languages (TypeScript, JavaScript, TSX, JSX, Python, Bash, JSON, HTML, CSS, Go, Rust, YAML, SQL, Markdown, Diff). Supports dual themes (`github-light` / `github-dark`) with automatic dark mode switching via CSS variables.

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

// Note: pending permissions are keyed by `permissionKey` (`${sessionId}:${requestId}`),
// so same `requestId` values from different sessions render as separate notifications.

// Profile/Settings dropdown menu for the header
import { ProfileButton } from '@kombuse/ui/components'
<Header center={...}>
  <NotificationBell />
  <ProfileButton onNavigate={navigate} />
</Header>
// Opens dropdown with "Profile" (/profile) and "Settings" (/settings) links

// Header props:
// - center: ReactNode rendered in the center between title and nav
// - onNavigateHome: Optional callback when the "Kombuse" logo is clicked
// - children: rendered in the right nav area

// Active agents indicator — shows running agent count with popover details
import { ActiveAgentsIndicator } from '@kombuse/ui/components'
<Header center={...}>
  <ActiveAgentsIndicator onNavigate={navigate} />
  <NotificationBell onNavigate={navigate} />
  <ProfileButton onNavigate={navigate} />
</Header>
// Shows Bot icon with green badge count of running agents
// Popover lists each session with agent name, status, ticket link, and duration
// Props: onNavigate?: (path: string) => void

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
import {
  LabelBadge, LabelCard, LabelDetail, LabelPicker, LabelSelector, LabelForm
} from '@kombuse/ui/components'

// Display a colored label badge
<LabelBadge label={label} onRemove={() => handleRemove(label.id)} />

// Label list item card (used in label management view)
<LabelCard
  label={label}
  isSelected={isSelected}
  onClick={() => handleClick(label)}
/>

// Label detail/edit panel with triggers section
<LabelDetail
  label={label}
  projectId={projectId}
  onClose={() => ...}
  onSave={(data) => ...}           // { name?, color?, description? }
  onDelete={() => ...}
  onNavigateToAgent={(agentId) => ...}
  isSaving={false}
  isDeleting={false}
/>

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

// Inline form for creating/editing labels (now includes description field)
<LabelForm
  label={existingLabel}  // Optional: for edit mode
  onSubmit={(data) => ...}  // { name, color, description? }
  onCancel={() => ...}
/>
```

### Milestone Components

```typescript
import {
  MilestoneBadge, MilestoneForm, MilestoneSelector
} from '@kombuse/ui/components'

// Display a milestone badge with optional progress
<MilestoneBadge milestone={milestone} size="sm" showProgress />

// Single-select dropdown for assigning a milestone (with optional inline creation)
<MilestoneSelector
  availableMilestones={projectMilestones}
  selectedMilestoneId={ticket.milestone_id ?? null}
  onSelect={(milestoneId) => updateTicket({ milestone_id: milestoneId })}
  onMilestoneCreate={(data) => createMilestone(data)}
  isCreating={isCreating}
  placeholder="Set milestone..."
/>

// Inline form for creating/editing milestones
<MilestoneForm
  milestone={existingMilestone}  // Optional: for edit mode
  onSubmit={(data) => ...}  // { title, description?, due_date? }
  onCancel={() => ...}
/>
```

### Trigger Components

```typescript
import { TriggerEditor, TriggerForm, TriggerList, TriggerItem } from '@kombuse/ui/components'
import { MentionTypePicker, getMentionTypeLabel } from '@kombuse/ui/components'
import { AuthorTypePicker, getAuthorTypeLabel } from '@kombuse/ui/components'

// Mention type picker for trigger conditions (select between @profile and #ticket)
<MentionTypePicker
  value={selectedMentionType}
  onValueChange={(type) => setSelectedMentionType(type)}
  disabled={false}
/>

// Comment author type picker for trigger conditions (human users or agents)
<AuthorTypePicker
  value={selectedAuthorType}
  onValueChange={(type) => setSelectedAuthorType(type)}
  disabled={false}
/>

// Get human-readable label for a mention type
getMentionTypeLabel('profile') // => "Profile mention (@)"
getMentionTypeLabel('ticket')  // => "Ticket mention (#)"

// Get human-readable label for an author type
getAuthorTypeLabel('user')  // => "Human only"
getAuthorTypeLabel('agent') // => "Agent only"
```

Props for `MentionTypePicker`:
- `value`: `MentionType | null` — current selection
- `onValueChange`: `(value: MentionType) => void` — selection callback
- `disabled`: Optional boolean

Props for `AuthorTypePicker`:
- `value`: `ActorType | null` — current selection
- `onValueChange`: `(value: ActorType) => void` — selection callback
- `disabled`: Optional boolean

#### ConditionEditor

Generic key-value condition editor used by `TriggerForm` for event types that don't have a specialized picker. Each condition row includes a **matches/excludes toggle** — when set to "excludes", the condition key is saved with an `exclude_` prefix (e.g. `exclude_completing_agent_id`), which the backend interprets as a negation condition.

Props for `ConditionEditor`:
- `conditions`: `Record<string, unknown> | null` — current conditions (handles `exclude_` prefixed keys)
- `onChange`: `(conditions: Record<string, unknown> | null) => void` — called when conditions change
- `disabled`: Optional boolean

### Markdown

```typescript
import { Markdown } from '@kombuse/ui/components'

// Basic markdown rendering
<Markdown>{'# Hello **world**'}</Markdown>

// With ticket link support (#22 → rich inline chip with title and status)
<Markdown projectId="my-project">{'See #22 for details'}</Markdown>

// @mentions are automatically styled (e.g., @AgentName renders as highlighted text)
<Markdown>{'Ask @CodingAgent to implement this'}</Markdown>

// Label references (~[Name](id) → colored badge chip, requires projectId)
<Markdown projectId="my-project">{'Apply ~[Bug](3) label'}</Markdown>

// Comment links (#ticketId/c/commentId → navigable chip with author name, requires projectId)
<Markdown projectId="my-project">{'See #235/c/901 for context'}</Markdown>
```

Props:
- `children`: Markdown string to render
- `className`: Optional class name
- `projectId`: Optional project ID — when provided, enables `#<number>` ticket chips, `~[Name](id)` label badges, and `#N/c/M` comment link chips (all fetched via React Query)

Code blocks use [Shiki](https://shiki.style) for syntax highlighting with dual-theme support (`github-light` / `github-dark`). Language detection is automatic from fenced code block language hints (e.g., `` ```typescript ``). Inline code retains simple muted styling.

Single newlines inside a paragraph are rendered as visible line breaks (`<br />`). Blank lines still create paragraph breaks, and fenced code blocks preserve their original newline content.

### TicketMentionChip

Used internally by `Markdown` to render rich ticket references. Can also be used standalone:

```typescript
import { TicketMentionChip } from '@kombuse/ui/components'

// Renders an inline chip: #42 · Ticket Title [status dot]
// Hovering shows a preview popover with title, body excerpt, status, labels, and timestamp
<TicketMentionChip ticketId={42} href="/projects/my-project/tickets/42" />

// Renders a plain text link while keeping the same hover preview popover
<TicketMentionChip ticketId={42} href="/projects/my-project/tickets/42" variant="inline" />
```

Props:
- `ticketId`: Ticket ID to fetch and display
- `href`: Navigation URL for the chip link
- `variant`: Optional render style (`"chip"` | `"inline"`, default `"chip"`)
- Falls back to a plain `#ID` link while loading or on error
- Shows a `HoverCard` popover on hover with ticket details (powered by `TicketPreviewCard`)

### TicketPreviewCard

Compact preview card used in the `TicketMentionChip` hover popover. Can also be used standalone:

```typescript
import { TicketPreviewCard } from '@kombuse/ui/components'

// Renders a compact card with ticket title, body excerpt, status, labels, and timestamp
<TicketPreviewCard ticket={ticketWithRelations} />
```

Props:
- `ticket`: `TicketWithRelations` — ticket object with author, assignee, and labels

### LabelMentionChip

Used internally by `Markdown` to render label references. Can also be used standalone:

```typescript
import { LabelMentionChip } from '@kombuse/ui/components'

// Renders a colored LabelBadge inline
<LabelMentionChip labelId={3} labelName="Bug" projectId="my-project" />
```

Props:
- `labelId`: Label ID to look up in project labels
- `labelName`: Display name (used as fallback if label not found)
- `projectId`: Project ID for fetching labels via `useProjectLabels`
- Falls back to muted `~Name` text if label not found

### CommentMentionChip

Used internally by `Markdown` to render comment links. Can also be used standalone:

```typescript
import { CommentMentionChip } from '@kombuse/ui/components'

// Renders a chip: #235/c/901 · AuthorName, linking to the comment anchor
<CommentMentionChip ticketId={235} commentId={901} projectId="my-project" />
```

Props:
- `ticketId`: Ticket ID for the link URL
- `commentId`: Comment ID to fetch and display
- `projectId`: Project ID for the link URL
- Falls back to a plain `#N/c/M` link while loading or on error

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
- Edit mode supports image attachments via paperclip button, drag-and-drop, and clipboard paste. Staged files are uploaded on save
- View mode displays ticket attachments as clickable thumbnails with lightbox

### Session Components

```typescript
import { SessionItem, SessionList } from '@kombuse/ui/components'

// Render a list of sessions with selection, delete, and status indicators
<SessionList
  sessions={sessions}
  selectedSessionId={selectedId}
  onSessionClick={(session) => navigate(`/chats/${session.kombuse_session_id}`)}
  onSessionDelete={(session) => deleteSession(session.kombuse_session_id!)}
  isSessionPendingPermission={(id) => hasPendingPermission(id)}
  isLoading={isLoading}
/>
```

`SessionItem` props:
- `session`: `PublicSession` object
- `isSelected`: Whether this item is visually selected
- `onClick`: Click handler
- `onDelete`: Delete handler (shows confirmation dialog)
- `hasPendingPermission`: Shows orange pulsing indicator when true

`SessionList` props:
- `sessions`: `PublicSession[]` to render
- `className`: Optional class name
- `selectedSessionId`: ID of the currently selected session
- `onSessionClick`: `(session: PublicSession) => void`
- `onSessionDelete`: `(session: PublicSession) => void`
- `isSessionPendingPermission`: `(kombuseSessionId: string | null) => boolean`
- `isLoading`: Shows loading state
- `emptyMessage`: Custom empty state text (default: "No sessions yet")

### Permission Components

```typescript
import { PermissionList, PermissionItem, PermissionFilters } from '@kombuse/ui/components'

// Render a list of permission log entries with links to tickets/sessions
<PermissionList
  entries={permissions}
  projectId="my-project"
  emptyMessage="No permission decisions found"
/>

// Render a single permission entry with ticket/session context
<PermissionItem entry={entry} projectId="my-project" />

// Filter bar with tool and behavior dropdowns
<PermissionFilters
  filters={{ tool_name: 'Bash', behavior: 'allow' }}
  onChange={(newFilters) => setFilters(newFilters)}
/>
```

`PermissionList` props:
- `entries`: `PermissionLogEntry[]` to render
- `projectId`: Optional project ID for building ticket/session links
- `className`: Optional class name
- `emptyMessage`: Custom empty state text (default: "No permission decisions found")

`PermissionItem` props:
- `entry`: `PermissionLogEntry` object
- `projectId`: Optional project ID for building ticket/session links
- `className`: Optional class name

`PermissionFilters` props:
- `filters`: `Omit<PermissionLogFilters, 'project_id'>` — current filter state
- `onChange`: `(filters: Omit<PermissionLogFilters, 'project_id'>) => void` — filter change callback

### Permission Editor Components

```typescript
import { PermissionEditor, PermissionRuleForm, PermissionRuleList, PermissionRuleItem } from '@kombuse/ui/components'

// Collapsible editor for an agent's permission rules
<PermissionEditor
  permissions={permissions}
  onChange={(updated) => setPermissions(updated)}
/>

// Standalone form for creating or editing a permission
<PermissionRuleForm
  permission={existingPermission}  // omit for create mode
  onSubmit={(p) => handleAdd(p)}
  onCancel={() => setMode('list')}
/>

// List of permission rules with edit/delete actions
<PermissionRuleList
  permissions={permissions}
  onEdit={(index) => handleEdit(index)}
  onDelete={(index) => handleDelete(index)}
/>

// Single permission rule display
<PermissionRuleItem
  permission={permission}
  onEdit={() => handleEdit()}
  onDelete={() => handleDelete()}
/>
```

`PermissionEditor` props:
- `permissions`: `Permission[]` — current permission rules
- `onChange`: `(permissions: Permission[]) => void` — called when permissions are added, edited, or deleted
- `className`: Optional class name

`PermissionRuleForm` props:
- `permission`: Optional `Permission` — if provided, form is in edit mode
- `onSubmit`: `(permission: Permission) => void` — called with the constructed permission
- `onCancel`: `() => void` — called when user cancels

`PermissionRuleList` props:
- `permissions`: `Permission[]` — permissions to display
- `onEdit`: `(index: number) => void` — called with the index of the permission to edit
- `onDelete`: `(index: number) => void` — called with the index of the permission to delete

`PermissionRuleItem` props:
- `permission`: `Permission` — the permission to display
- `onEdit`: `() => void` — edit callback
- `onDelete`: `() => void` — delete callback
- `className`: Optional class name

Tool presets in `PermissionRuleForm` include Kombuse MCP actions such as `Get Ticket`, `Get Ticket Comment`, `Add Comment`, and `Update Ticket`.
The `Get Ticket Comment` option maps to tool rule `mcp__kombuse__get_ticket_comment`.

### Agent Picker

```typescript
import { AgentPicker } from '@kombuse/ui/components'

// Inline agent selector for new chat sessions
<AgentPicker
  value={selectedAgentId}
  onChange={(agentId) => setSelectedAgentId(agentId)}
  disabled={!isDraft}
/>
```

Props:
- `value`: `string | null` — currently selected agent ID (null = no agent)
- `onChange`: `(agentId: string | null) => void` — called when selection changes
- `disabled`: Optional boolean — disables the picker (use for existing sessions)
- `className`: Optional class name

Features:
- Popover with searchable agent list (only shows enabled agents with `enabled_for_chat` config)
- Shift+Tab keyboard shortcut cycles through available agents
- "No agent" option for plain chat sessions

### Agent Components

```typescript
import { AgentCard, AgentDetail } from '@kombuse/ui/components'

// Card for agent list view — shows name, avatar, toggle, and agent ID
<AgentCard
  agent={agent}
  profile={profile}
  isSelected={isSelected}
  onClick={() => handleSelect(agent.id)}
  onToggle={(enabled) => handleToggle(agent.id, enabled)}
  isToggling={false}
/>

// Detail panel — tabbed editor with copyable agent ID in the header
<AgentDetail
  agent={agent}
  profile={profile}
  triggers={triggers}
  onClose={() => ...}
  onSave={(updates) => ...}
  onDelete={() => ...}
/>
```

Both `AgentCard` and `AgentDetail` display the agent ID (`agent.id`) so users can easily reference it in trigger conditions. `AgentDetail` includes a click-to-copy button next to the ID.

`AgentDetail` is split into two tabs:
- `Basic Info`: name, description, avatar, system prompt
- `Configuration`: available-in-chat toggle, backend override, model override, permissions, triggers
- Tab switches preserve in-progress editor state (for example unsaved permission/trigger drafts)
- Save action: rendered in a persistent footer and shown only when there are unsaved changes

### Prompt Editor

```typescript
import { PromptEditor } from '@kombuse/ui/components'
import { TEMPLATE_VARIABLE_GROUPS } from '@kombuse/ui/components'
import { TEMPLATE_ENGINE_NOTE, TEMPLATE_SNIPPET_GROUPS } from '@kombuse/ui/components'
import type {
  TemplateVariable,
  TemplateVariableGroup,
  TemplateSnippet,
  TemplateSnippetGroup,
} from '@kombuse/ui/components'

// Basic prompt editor
<PromptEditor
  value={prompt}
  onChange={setPrompt}
  placeholder="Enter your system prompt..."
/>

// With available variables panel (for agent prompts)
<PromptEditor
  value={prompt}
  onChange={setPrompt}
  showAvailableVariables
/>

// With custom variable catalog
<PromptEditor
  value={prompt}
  onChange={setPrompt}
  showAvailableVariables
  availableVariables={customGroups}
/>
```

Props:
- `value`: Prompt text value
- `onChange`: Callback when text changes
- `placeholder`: Input placeholder (default: "Enter your system prompt...")
- `disabled`: Disable editing
- `className`: Additional CSS class
- `minHeight` / `maxHeight`: Textarea height constraints (default: 200 / 500)
- `showCounts`: Show character/token counts in footer (default: true)
- `showPreview`: Show edit/preview toggle (default: true)
- `showAvailableVariables`: Show collapsible panel of available template variables (default: false)
- `availableVariables`: Override the default variable catalog (`TEMPLATE_VARIABLE_GROUPS`)

`TemplateVariable` shape:
- `name`: Variable key used in templates
- `description`: What the variable provides
- `availability` (optional): Condition-based availability guidance shown in hover help

`TemplateSnippet` shape:
- `label`: Button label shown in the helper panel
- `template`: Raw Nunjucks snippet inserted into the prompt

The available variables panel now includes:
- A plain engine note: `Templating engine: Nunjucks` (`TEMPLATE_ENGINE_NOTE`)
- Basic block snippets (`TEMPLATE_SNIPPET_GROUPS`) such as `if / else`, `for`, and comments
- Existing grouped variable badges (Event, Ticket, Project, Comment, Actor, Session)

Insertion behavior:
- Clicking a variable badge inserts `{{ variable }}` at the cursor position.
- Clicking a snippet inserts the raw snippet text verbatim (no automatic `{{ }}` wrapping).
- In both cases, insertion replaces any selected text and leaves the cursor at the end of the inserted content.
- Variable and snippet buttons are disabled when the editor is disabled or in preview mode.

Variables already used in the prompt are highlighted with a checkmark. Hovering or focusing a variable badge opens a custom tooltip with both `description` and `availability` details. If a custom variable omits `availability`, the tooltip shows a fallback availability message.

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
- `backendSessionId`: Optional Claude backend session ID — displayed as a truncated monospace label with click-to-copy for debugging

`SessionViewer` props:
- `events`: `SerializedAgentEvent[]` to render
- `isLoading`, `emptyMessage`: Loading/empty states
- `viewMode`: `'clean' | 'normal'` (default `'normal'`) — in `'clean'` mode, `message` and `error` events are shown, plus plan milestone tools (`ExitPlanMode`, `TodoWrite`)
- Auto-scrolls to bottom when new events arrive (if already at bottom)
- Shows a floating scroll-to-bottom button when the user scrolls up

`Chat` manages `viewMode` state internally and passes it to both `SessionHeader` and `SessionViewer`.

`BashRenderer` (in `renderers/`):
- Dedicated renderer for Bash tool_use and tool_result events in the session timeline
- Renders commands in a terminal-style dark card with `$ command` prompt, monospace font, and collapsible output
- Shows optional `description`, `run_in_background`, and `timeout` metadata as badges
- Error states display red ring and red output text

`ErrorRenderer` (in `renderers/`):
- Dedicated renderer for `error` session events
- Shows error name and user-facing message with destructive styling
- Formats escaped stack traces (`\\n`) into readable multiline output with both horizontal and vertical scrolling

`CompleteRenderer` (in `renderers/`):
- Dedicated renderer for `complete` session events
- Shows success/failure status, reason badge, and optional exit code
- Shows optional failure details (`errorMessage`, `resumeFailed`) when present

`AskUserBar` props:
- `permission`: `SerializedAgentPermissionRequestEvent` — the pending permission request with `toolName: 'AskUserQuestion'`
- `onRespond`: `(updatedInput: Record<string, unknown>) => void` — callback with the original input plus populated `answers` map
- Renders structured questions with selectable option cards (single-select and multi-select), an "Other" free-text option, and a submit button
- Returns `null` if `input.questions` is malformed (falls back to `PermissionBar` in `Chat`)

`AskUserRenderer` (in `renderers/`):
- Read-only renderer for historical `AskUserQuestion` permission request events in the session timeline
- Falls back to `PermissionRequestRenderer` if `input.questions` is malformed

`PlanApprovalBar` props:
- `permission`: `SerializedAgentPermissionRequestEvent` — the pending permission request with `toolName: 'ExitPlanMode'`
- `onRespond`: `(behavior: 'allow' | 'deny', message?: string) => void` — callback for user decision
- Renders a plan approval checkpoint with indigo/purple theme
- Three actions: Approve (green), Reject (destructive), Request Changes (reveals text input)
- Displays `allowedPrompts` from the permission input if present (permissions the plan will need)
- Keyboard: `Cmd/Ctrl+Enter` approves, `Escape` toggles revision input

`PlanPreviewDialog` props:
- `permission`: `PendingPermission | null` — the plan permission to display (dialog opens when non-null)
- `onOpenChange`: `(open: boolean) => void` — callback when dialog open state changes
- `onAllow`: `(permission: PendingPermission) => void` — approve callback
- `onDeny`: `(permission: PendingPermission, message?: string) => void` — reject/request changes callback
- `onNavigate`: Optional `(path: string) => void` — navigation callback for "Open" link
- `navigationPath`: Optional string — path to navigate to
- Fetches session events and extracts plan content from assistant messages preceding the `ExitPlanMode` tool use
- Renders plan as scrollable markdown with Approve, Reject, and Request Changes actions

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
- `highlightedCommentId`: Optional comment ID to highlight with a ring — used by `useScrollToComment` for hash fragment navigation
- `editingCommentId`: ID of comment being edited (or null)
- `editBody`: Current edit text value
- `onEditBodyChange`: Callback when edit text changes
- `onStartEditComment`: Callback when edit button clicked
- `onSaveEditComment`: Callback `(stagedFiles?: File[]) => void` — receives optional staged files to upload after saving
- `onCancelEditComment`: Callback to cancel editing
- `onDeleteComment`: Callback to delete a comment
- `onReplyComment`: Callback when reply button clicked on a comment
- `isUpdatingComment`, `isDeletingComment`: Loading states

Props for `CommentItem`:
- `comment`: `CommentWithAuthor` object
- `parentComment`: Optional `CommentWithAuthor` — when provided, renders a "Replying to {name}" indicator between the header and body
- `projectId`: Optional project ID — enables `#<number>` ticket link rendering in comment body and builds correct route for session links on agent comments
- `attachments`: Optional `Attachment[]` to display as inline image thumbnails below the comment body — clicking a thumbnail opens the image lightbox
- Edit mode supports image attachments via paperclip button, drag-and-drop, and clipboard paste. Staged files are passed to `onSaveEdit(stagedFiles?)` on save

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

### StagedFilePreviews

```typescript
import { StagedFilePreviews } from '@kombuse/ui/components'

// Display thumbnails of staged files with remove buttons
<StagedFilePreviews
  stagedFiles={stagedFiles}
  previewUrls={previewUrls}
  onRemove={(index) => removeFile(index)}
  className="mt-1"
/>
```

Props:
- `stagedFiles`: `File[]` — array of staged File objects
- `previewUrls`: `string[]` — matching array of object URLs for previews
- `onRemove`: `(index: number) => void` — callback when a file's remove button is clicked
- `className`: Optional class name (merged with default flex layout)
- Returns `null` when `stagedFiles` is empty
- Used internally by `ChatInput`, `CommentItem`, `TicketDetail`, and the ticket create form

Props for `ChatInput`:
- `onSubmit`: Callback `(message: string, files?: File[]) => void` — receives message text and optional staged files
- `placeholder`: Input placeholder text
- `isLoading`, `disabled`: Loading/disabled states
- `replyTarget`: Optional `ReplyTarget` object (`{ commentId, authorId, isAgentSession }`) — shows reply indicator when set
- `onCancelReply`: Callback to dismiss reply mode
- `onStop`: Optional callback — when provided and `isLoading` is true, replaces the spinner with a destructive stop button
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
  useTicketAttachments,
  useUploadTicketAttachment,
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

// Fetch attachments for a ticket
const { data: ticketAttachments } = useTicketAttachments(ticketId)

// Upload a file to a ticket
const uploadToTicket = useUploadTicketAttachment()
uploadToTicket.mutateAsync({ ticketId: 1, file: myFile, uploadedById: 'user-1' })
```

### Project Hooks

```typescript
import {
  useProjects,
  useProject,
  useCreateProject,
  useUpdateProject,
  useDeleteProject,
} from '@kombuse/ui/hooks'

// Fetch all projects (with optional filters)
const { data: projects, isLoading } = useProjects({ search: 'kombuse' })

// Fetch a single project by ID
const { data: project } = useProject('project-id')

// CRUD mutations
const createProject = useCreateProject()
createProject.mutate({ name: 'My Project', owner_id: 'user-1' })

const updateProject = useUpdateProject()
updateProject.mutate({ id: 'project-id', input: { name: 'New Name' } })

const deleteProject = useDeleteProject()
deleteProject.mutate('project-id')
```

### Claude Code Hooks

```typescript
import { useClaudeCodeProjects, useImportClaudeCodeProjects } from '@kombuse/ui/hooks'

// Scan ~/.claude/projects/ for discovered Claude Code projects
const { data: projects, isLoading } = useClaudeCodeProjects()
// Returns ClaudeCodeProjectWithStatus[] (name, path, totalSessions, totalMessages, isImported)

// Import selected projects into the database
const importProjects = useImportClaudeCodeProjects()
importProjects.mutate(['/path/to/project-a', '/path/to/project-b'])
// Invalidates both 'claude-code-projects' and 'projects' queries on success
```

### Permission Hooks

```typescript
import { usePermissions } from '@kombuse/ui/hooks'

// Fetch permission log entries for a project (with optional filters)
const { data: permissions, isLoading } = usePermissions('project-id', {
  tool_name: 'Bash',
  behavior: 'allow',
  limit: 50,
  offset: 0,
})
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

### Milestone Hooks

```typescript
import {
  useProjectMilestones,
  useMilestone,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
} from '@kombuse/ui/hooks'

// Fetch milestones for a project (with stats: open_count, closed_count, total_count)
const { data: milestones } = useProjectMilestones('project-id')

// Fetch a single milestone with stats
const { data: milestone } = useMilestone(milestoneId)

// CRUD for milestones
const createMilestone = useCreateMilestone('project-id')
createMilestone.mutate({ title: 'v1.0', due_date: '2026-03-01' })

const updateMilestone = useUpdateMilestone('project-id')
updateMilestone.mutate({ id: 1, input: { status: 'closed' } })

const deleteMilestone = useDeleteMilestone('project-id')
deleteMilestone.mutate(milestoneId)
```

```typescript
import { useMilestoneOperations } from '@kombuse/ui/hooks'

// Context-aware hook for milestone operations on the current ticket
const {
  projectMilestones,    // MilestoneWithStats[]
  currentMilestone,     // MilestoneWithStats | null (for current ticket)
  createMilestone,
  updateMilestone,
  deleteMilestone,
  isLoading, isCreating, isUpdating, isDeleting,
} = useMilestoneOperations()
```

```typescript
import { useTriggersByLabel } from '@kombuse/ui/hooks'

// Fetch triggers that reference a label (via conditions.label_id)
const { data: triggers } = useTriggersByLabel(labelId)
```

### Code Diff

```typescript
import { CodeDiff } from '@kombuse/ui/components'

// Display a syntax-highlighted diff between two code strings
<CodeDiff
  original="const x = 1;"
  modified="const x = 2;"
  filePath="example.ts"    // Used for language auto-detection
  maxHeight={400}           // Max height in px (default: 400)
/>
```

Props:
- `original`: Left-side (old) text
- `modified`: Right-side (new) text
- `filePath`: Optional file path for automatic language detection
- `language`: Optional explicit Monaco language ID (overrides filePath detection)
- `height`: Explicit height (string or number). Defaults to auto-computed from content
- `maxHeight`: Maximum height in pixels when auto-computing (default: 400)
- `readOnly`: Whether the diff is read-only (default: `true`)
- `className`: Additional CSS class for the wrapper

Theme: Automatically syncs with the app's dark/light mode via `next-themes`.
Lazy loaded: Monaco only loads when the component first mounts.
Includes an inline/side-by-side toggle button in the top-right corner.

### Code Viewer

```typescript
import { CodeViewer } from '@kombuse/ui/components'

// Display syntax-highlighted read-only code
<CodeViewer
  value={fileContent}
  filePath="example.ts"    // Used for language auto-detection
  maxHeight={300}           // Max height in px (default: 300)
/>
```

Props:
- `value`: The code string to display
- `filePath`: Optional file path for automatic language detection
- `language`: Optional explicit Monaco language ID (overrides filePath detection)
- `maxHeight`: Maximum height in pixels (default: 300)
- `className`: Additional CSS class for the wrapper

Theme: Automatically syncs with the app's dark/light mode via `next-themes`.
Lazy loaded: Monaco only loads when the component first mounts.
Used internally by `ReadRenderer` and `WriteRenderer` for syntax-highlighted file content.

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
import { detectLanguage } from '@kombuse/ui/lib/language-map'

// Detect Monaco language ID from a file path
detectLanguage('/path/to/file.tsx')  // => 'typescript'
detectLanguage('Dockerfile')         // => 'dockerfile'
detectLanguage('unknown.xyz')        // => 'plaintext'
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
