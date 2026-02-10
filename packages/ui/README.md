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
│   ├── permissions/      - Permission decision log components
│   ├── sessions/         - Session list components
│   ├── tickets/          - Ticket components
│   ├── header.tsx
│   ├── profile-button.tsx       - Header profile link button
│   └── mode-toggle.tsx
├── hooks/          - React hooks
│   ├── use-command.ts         - Execute specific commands
│   ├── use-commands.ts        - Get all available commands
│   ├── use-command-context.ts - Access command registry
│   ├── use-profile.ts           - Current user profile hook
│   ├── use-attachments.ts      - Attachment CRUD hooks
│   ├── use-file-staging.ts     - File staging with validation, previews, drag-and-drop
│   ├── use-claude-code.ts     - Claude Code project scanner hooks
│   ├── use-labels.ts          - Label CRUD hooks
│   ├── use-permissions.ts     - Permission log query hook
│   ├── use-projects.ts        - Project CRUD hooks
│   └── use-tickets.ts         - Ticket CRUD hooks
├── providers/      - Context providers
│   ├── command-provider.tsx   - Command system provider
│   └── theme-provider.tsx     - Theme provider (next-themes)
└── lib/            - Utilities
    ├── api.ts                 - API client (tickets, comments, labels, attachments, permissions)
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
import { useProfile, useCurrentUserProfile } from '@kombuse/ui/hooks'

// Fetch a profile by ID
const { data: profile, isLoading } = useProfile('user-1')

// Fetch the current user's profile (hardcoded to "user-1" until auth is implemented)
const { data: currentUser } = useCurrentUserProfile()
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

// Profile button for the header (navigates to /profile)
import { ProfileButton } from '@kombuse/ui/components'
<Header center={...}>
  <NotificationBell />
  <ProfileButton onNavigate={navigate} />
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

// With ticket link support (#22 → rich inline chip with title and status)
<Markdown projectId="my-project">{'See #22 for details'}</Markdown>

// @mentions are automatically styled (e.g., @AgentName renders as highlighted text)
<Markdown>{'Ask @CodingAgent to implement this'}</Markdown>
```

Props:
- `children`: Markdown string to render
- `className`: Optional class name
- `projectId`: Optional project ID — when provided, `#<number>` patterns render as rich inline chips showing the ticket ID, title, and a status dot (fetched automatically via React Query)

Code blocks use [Shiki](https://shiki.style) for syntax highlighting with dual-theme support (`github-light` / `github-dark`). Language detection is automatic from fenced code block language hints (e.g., `` ```typescript ``). Inline code retains simple muted styling.

### TicketMentionChip

Used internally by `Markdown` to render rich ticket references. Can also be used standalone:

```typescript
import { TicketMentionChip } from '@kombuse/ui/components'

// Renders an inline chip: #42 · Ticket Title [status dot]
<TicketMentionChip ticketId={42} href="/projects/my-project/tickets/42" />
```

Props:
- `ticketId`: Ticket ID to fetch and display
- `href`: Navigation URL for the chip link
- Falls back to a plain `#ID` link while loading or on error

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
- `viewMode`: `'clean' | 'normal'` (default `'normal'`) — in `'clean'` mode, only `message` events are shown; tool uses, permission requests, and raw events are hidden
- Auto-scrolls to bottom when new events arrive (if already at bottom)
- Shows a floating scroll-to-bottom button when the user scrolls up

`Chat` manages `viewMode` state internally and passes it to both `SessionHeader` and `SessionViewer`.

`AskUserBar` props:
- `permission`: `SerializedAgentPermissionRequestEvent` — the pending permission request with `toolName: 'AskUserQuestion'`
- `onRespond`: `(updatedInput: Record<string, unknown>) => void` — callback with the original input plus populated `answers` map
- Renders structured questions with selectable option cards (single-select and multi-select), an "Other" free-text option, and a submit button
- Returns `null` if `input.questions` is malformed (falls back to `PermissionBar` in `Chat`)

`AskUserRenderer` (in `renderers/`):
- Read-only renderer for historical `AskUserQuestion` permission request events in the session timeline
- Falls back to `PermissionRequestRenderer` if `input.questions` is malformed

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
