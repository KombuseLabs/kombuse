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
│   ├── chat/             - Chat transcript UI, session header backend-details popover, and SessionViewer renderers (including generic kombuse MCP tool cards)
│   ├── labels/           - Label management components
│   ├── milestones/       - Milestone management components
│   ├── prompt-editor/    - System prompt editor with template variables
│   ├── mobile-list-detail.tsx - Mobile list/detail navigation wrapper
│   ├── sidebar/          - Sidebar navigation (panel + icon rail variants), bottom nav + backend status indicator
│   ├── backend-status-banner.tsx - Warning banner for outdated CLI backends or Node.js versions
│   ├── find-bar.tsx              - Find-in-page bar for Electron desktop app
│   ├── no-backend-screen.tsx     - Full-page blocking screen when no backends found
│   ├── permissions/      - Permission decision log components
│   ├── sessions/         - Session list components
│   ├── tickets/          - Ticket components
│   ├── header.tsx
│   ├── layout-toggle.tsx        - Layout toggle button for list panel visibility (size-icon, size-5 icon — matches header icons)
│   ├── profile-button.tsx       - Header user menu dropdown (Profile + Settings)
│   ├── update-notification.tsx  - Update toast notifications (app + shell updater)
│   └── mode-toggle.tsx
├── hooks/          - React hooks
│   ├── use-agents.ts          - Agent CRUD, profile, toggle, and export hooks
│   ├── use-available-backends.ts - Available backend filtering hook
│   ├── use-backend-status.ts  - Backend CLI availability query hooks
│   ├── use-command.ts         - Execute specific commands
│   ├── use-commands.ts        - Get all available commands
│   ├── use-command-context.ts - Access command registry
│   ├── use-profile.ts           - Current user profile hook
│   ├── use-attachments.ts      - Attachment CRUD hooks
│   ├── use-file-staging.ts     - File staging with validation, previews, drag-and-drop
│   ├── use-scroll-to-bottom.ts - Auto-scroll and floating scroll button hook
│   ├── use-claude-code.ts     - Claude Code project scanner hooks
│   ├── use-database.ts        - Database table/query hooks
│   ├── use-desktop.ts         - Electron desktop detection hook
│   ├── use-is-mobile.ts       - Mobile viewport detection hook
│   ├── use-shell-updates.ts   - Shell (Electron) auto-update hook
│   ├── update-utils.ts        - Pure helpers for update status computation
│   ├── use-labels.ts          - Label CRUD hooks
│   ├── use-milestones.ts      - Milestone CRUD hooks
│   ├── use-analytics.ts       - Analytics query hooks (sessions, duration, tool usage)
│   ├── use-plugins.ts         - Plugin export, install, lifecycle hooks
│   ├── use-plugin-sources.ts  - Plugin source configuration hooks (read/write)
│   ├── use-permissions.ts     - Permission log query hook
│   ├── use-models.ts          - Model catalog query hook
│   ├── use-profile-settings.ts - Profile settings read/write hooks (single + all)
│   ├── use-projects.ts        - Project CRUD hooks
│   ├── use-shiki.ts           - Shiki syntax highlighter hook (singleton, lazy-loaded)
│   └── use-tickets.ts         - Ticket CRUD hooks
├── providers/      - Context providers
│   ├── command-provider.tsx   - Command system provider
│   └── theme-provider.tsx     - Theme provider (next-themes)
└── lib/            - Utilities
    ├── api.ts                 - API client (tickets, comments, labels, milestones, attachments, permissions, models, database, agents, plugins, plugin sources)
    ├── backend-utils.ts       - Backend display utilities (backendLabel, normalizeBackendType, normalizeBackendChoice, getInstallCommand)
    ├── remark-comment-links.ts  - Remark plugin: #N/c/M comment link syntax
    ├── remark-label-mentions.ts - Remark plugin: ~[Name](id) label mention syntax
    ├── remark-profile-mentions.ts - Remark plugin: @mention syntax
    ├── remark-ticket-links.ts   - Remark plugin: #N ticket link syntax
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
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from '@kombuse/ui/base'
import { Input } from '@kombuse/ui/base'
```

Available: `Badge`, `Button`, `Card`, `Checkbox`, `Collapsible`, `Command`, `Dialog`, `DropdownMenu`, `HoverCard`, `Input`, `Label`, `Popover`, `Progress`, `RadioGroup`, `Resizable`, `Select`, `Sheet`, `Sonner`, `Tabs`, `Textarea`, `Tooltip`

#### Textarea Auto-Resize

The `Textarea` component supports auto-expanding to fit content:

```typescript
// Auto-expands as user types (max height: 60vh, then scrolls)
<Textarea value={value} onChange={handleChange} autoResize />

// With custom max height (pixels or CSS value)
<Textarea value={value} onChange={handleChange} autoResize autoResizeMaxHeight={400} />
```

- `autoResize`: When true, textarea grows vertically to fit content and disables manual resize handle
- `autoResizeMaxHeight`: Max height before overflow scrolling (default: `'60vh'`). Accepts number (px) or string (CSS value)

### Resizable Panels

```typescript
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  ResizableCardPanel,
  ResizableCardHandle,
} from '@kombuse/ui/base'

// Horizontal split with drag handle
<ResizablePanelGroup orientation="horizontal">
  <ResizablePanel id="list" defaultSize={50} minSize={25}>
    <ResizableCardPanel side="list">
      <LeftContent />
    </ResizableCardPanel>
  </ResizablePanel>
  <ResizableCardHandle />
  <ResizablePanel id="detail" defaultSize={50} minSize={25}>
    <ResizableCardPanel side="detail">
      <RightContent />
    </ResizableCardPanel>
  </ResizablePanel>
</ResizablePanelGroup>
```

Props:
- `ResizablePanelGroup`: `orientation` ("horizontal" | "vertical"), `defaultLayout`, `onLayoutChanged`, `className`, `resizeTargetMinimumSize` (defaults to `{ fine: 12, coarse: 24 }` for improved drag hit targets)
- `ResizablePanel`: `id`, `defaultSize`, `minSize`, `maxSize`, `collapsible`, `collapsedSize`
- `ResizableHandle`: `withHandle` (shows grip icon), `disabled`, `className`; supports `data-separator` interaction states (`inactive`, `hover`, `active`, `disabled`) with focus-visible ring styling
- `ResizableCardPanel`: split-layout wrapper with explicit top/bottom insets (`pt-3`/`pb-6`) and side-aware gutters (`side="list" | "detail"`) so list/detail cards align with the rail sidebar and remain evenly spaced
- `ResizableCardHandle`: transparent split-layout handle for card-separated panes (no extra visible divider line)

### Query Keys

Central query key registry for React Query cache management. All query keys are defined as typed factory objects — never use inline string arrays.

```typescript
import { ticketKeys, sessionKeys, commentKeys } from '@kombuse/ui/lib/query-keys'

// In useQuery
queryKey: ticketKeys.list(filters)
queryKey: ticketKeys.byNumber(projectId, ticketNumber)

// In invalidateQueries (prefix-based)
queryClient.invalidateQueries({ queryKey: ticketKeys.all })
```

See `src/lib/query-keys.ts` for the full list of 24 key groups: `ticketKeys`, `commentKeys`, `ticketTimelineKeys`, `labelKeys`, `agentKeys`, `profileKeys`, `sessionKeys`, `projectKeys`, `milestoneKeys`, `triggerKeys`, `analyticsKeys`, `pluginKeys`, `pluginFileKeys`, `pluginSourceKeys`, `permissionKeys`, `eventKeys`, `databaseKeys`, `modelKeys`, `profileSettingKeys`, `backendStatusKeys`, `updateKeys`, `claudeCodeKeys`, `codexKeys`, `attachmentKeys`.

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
import { useIsMobile } from '@kombuse/ui/hooks'

// Detect if viewport is mobile-width (< 768px)
const isMobile = useIsMobile()
// Always returns false in Electron desktop app
// SSR-safe: returns false when window is undefined
// Uses matchMedia listener for efficient threshold-based updates
```

```typescript
import { useDocumentTitle } from '@kombuse/ui/hooks'

// Set the browser/Electron window title (restores previous title on unmount)
useDocumentTitle('My Project — Kombuse')
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
import { useModels } from '@kombuse/ui/hooks'

// Fetch the model catalog for a backend type
const { data: catalog, isLoading } = useModels('codex')
// catalog?.supports_model_selection => true
// catalog?.models => ModelOption[] (id, name, description)
// catalog?.default_model_id => 'o3'
```

```typescript
import { useBackendStatus, useRefreshBackendStatus } from '@kombuse/ui/hooks'

// Query backend CLI availability (claude-code, codex)
const { data: statuses, isLoading } = useBackendStatus()
// statuses => BackendStatus[] with { backendType, available, version, path, meetsMinimum, nodeVersion, meetsNodeMinimum, ... }

// Refresh mutation (clears server cache, re-checks)
const refreshMutation = useRefreshBackendStatus()
refreshMutation.mutate()
```

```typescript
import { useAvailableBackends } from '@kombuse/ui/hooks'

// Filter backends by system availability for dropdown rendering
const { availableBackends, isAvailable, isLoading, noneAvailable } = useAvailableBackends()
// availableBackends: BackendType[] — only installed user-facing backends (excludes mock)
// isAvailable(bt): boolean — check if a specific backend is available
// isLoading: boolean — true while fetching (returns empty list as pessimistic default)
// noneAvailable: boolean — true when no backends are available after loading
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
import { useAutoResizeTextarea } from '@kombuse/ui/hooks'

// Auto-resize a textarea to fit its content
const { textareaRef, resize } = useAutoResizeTextarea({
  value: textValue,
  maxHeight: '60vh', // default; accepts number (px) or string (CSS value)
})

<textarea ref={textareaRef} value={textValue} onChange={handleChange} />
```

- `value`: The controlled value — resize triggers on every change
- `maxHeight`: Max height before scrollbar appears (default: `'60vh'`)
- `enabled`: Set to `false` to disable auto-resize (default: `true`)
- Returns `textareaRef` to attach to the element and `resize()` for manual triggers
- Uses `useLayoutEffect` for flicker-free resize

```typescript
import { useComment } from '@kombuse/ui/hooks'

// Fetch a single comment by ID (used by CommentMentionChip)
const { data: comment, isLoading } = useComment(commentId)
// Returns CommentWithAuthor (includes author profile)
```

```typescript
import { useSessionByKombuseId } from '@kombuse/ui/hooks'

// Resolve a kombuse session ID (e.g. "trigger-abc123") to its Session object
// Session-aware components should prefer ticket URLs when ticket_id exists:
// /projects/:projectId/tickets/:ticketNumber?session=:sessionId
// Fallback to /projects/:projectId/chats/:sessionId only when no ticket context exists.
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
  isTimelineLoaded: Boolean(selectedTicket && isTimelineFetched),
})
```

- Reads `location.hash` via React Router's `useLocation()` and parses `#comment-{id}`
- Scrolls the target comment into view (`smooth`, `center`) once ticket detail is mounted and timeline fetch is complete
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

```typescript
import { useClaudeCodeMcpStatus, useSetClaudeCodeMcpEnabled } from '@kombuse/ui/hooks'

// Query Claude Code MCP registration status
const { data: status, isLoading } = useClaudeCodeMcpStatus()
// status?.enabled => boolean (whether kombuse entry exists in settings.local.json)
// status?.config_path => string (absolute path to settings.local.json)

// Toggle Claude Code MCP registration
const setEnabled = useSetClaudeCodeMcpEnabled()
setEnabled.mutate(true)  // writes mcpServers.kombuse to ~/.claude/settings.local.json
setEnabled.mutate(false) // removes mcpServers.kombuse entry
```

```typescript
import { useDefaultBackendType } from '@kombuse/ui/hooks'

// Access the global default backend type from AppContext
const { defaultBackendType, setDefaultBackendType } = useDefaultBackendType()
// defaultBackendType: BackendType — current default ('claude-code', 'codex', etc.)
// setDefaultBackendType: (backendType: BackendType) => void
```

### Providers

```typescript
import { CommandProvider, ThemeProvider } from '@kombuse/ui/providers'
```

### Components

```typescript
import { ModelSelector } from '@kombuse/ui/components'

// Model dropdown scoped to a backend type, with provider optgroup grouping
<ModelSelector
  backendType="codex"
  value={selectedModel}
  onChange={(modelId) => setSelectedModel(modelId)}
/>

// Props:
// - backendType: BackendType | undefined — backend to fetch models for
// - value: string — selected model ID ("" = use backend default)
// - onChange: (modelId: string) => void — selection callback
// - disabled?: boolean
// - id?: string — HTML id for label association
// - className?: string
// - showDefaultHint?: boolean (default: true) — show "Backend default: X" hint
//
// When a backend does not support model selection, renders a disabled
// <select> with "Not supported" instead of a model dropdown.
```

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
// - minimal: Optional boolean. When true, hides center and right nav sections (shows only title + macOS padding)
// - onNavigateHome: Optional callback when the "Kombuse" logo is clicked
// - children: rendered in the right nav area
// - canGoBack: Optional boolean, enables the back arrow button
// - canGoForward: Optional boolean, enables the forward arrow button
// - onGoBack: Optional callback when back arrow is clicked
// - onGoForward: Optional callback when forward arrow is clicked
// When onGoBack and onGoForward are both provided, back/forward chevron
// buttons render to the left of the title. Buttons are disabled when
// their corresponding can* prop is false.
// Header chrome:
// - No bottom border in any rendering context
// - Preserves macOS title alignment (`pl-20`) while adding +5px breathing room to center search and right controls

// Active agents indicator — shows running agent count with popover details
import { ActiveAgentsIndicator } from '@kombuse/ui/components'
<Header center={...}>
  <ActiveAgentsIndicator onNavigate={navigate} />
  <NotificationBell onNavigate={navigate} />
  <ProfileButton onNavigate={navigate} />
</Header>
// Shows Bot icon with green badge count of running agents
// Popover lists each session with agent name, status, ticket metadata (`#id` + truncated title when available), and duration
// Includes a "Backend Status" footer section showing availability dots, backend names, and versions
// When a backend is unavailable, a "Check Again" refresh button appears
// Props: onNavigate?: (path: string) => void

// CommandPalette supports #ticket search and navigation
// Type # followed by a number or search term to find tickets
// Includes a SearchBar trigger showing "Search commands and tickets..." with ⌘K badge
import { TicketList, TicketDetail } from '@kombuse/ui/components'
import { LabelBadge, LabelPicker, LabelSelector, LabelForm } from '@kombuse/ui/components'
import { Sidebar, SidebarItem } from '@kombuse/ui/components'
```

### FindBar

```typescript
import { FindBar } from '@kombuse/ui/components'

// Renders a find-in-page bar in Electron desktop app (auto-hides in browser)
<FindBar />
```

- Only renders when `window.electron.findInPage` is available (Electron desktop app)
- Toggled via Cmd+F (macOS) / Ctrl+F (Windows/Linux) from the Edit menu
- Uses `webContents.findInPage()` for native Chromium text search with match highlighting
- Supports previous/next navigation (Enter/Shift+Enter), match count display, and Escape to close
- In the regular web app, returns `null` and browser-native find works as usual

### UpdateStatusDialog

```typescript
import { UpdateStatusDialog } from '@kombuse/ui/components'

// Mount once in app root — self-contained, manages its own open state
<UpdateStatusDialog />
```

- Opens via Electron menu "Check for Updates..." (IPC) or Cmd+K command palette
- Shows two rows: **Package** (server+web) and **App** (shell/Electron)
- Each row displays current version, status badge, and context-sensitive action button
- Status badges: Up to date, Checking, Update available, Downloading (with progress bar), Verifying, Ready to install, Error
- Auto-triggers update checks when opened
- "Check All" button re-checks both channels simultaneously

### Sidebar Components

```typescript
import { Sidebar, SidebarItem } from '@kombuse/ui/components'
import { Ticket, Bot } from 'lucide-react'

// Collapsible panel sidebar
<Sidebar
  variant="panel"
  isCollapsed={isCollapsed}
  onCollapsedChange={setIsCollapsed}
  header={<span>Project Name</span>}
>
  <SidebarItem
    icon={<Ticket className="size-4" />}
    label="Tickets"
    to="/projects/123/tickets"
    variant="panel"
    isCollapsed={isCollapsed}
  />
  <SidebarItem
    icon={<Bot className="size-4" />}
    label="Agents"
    to="/projects/123/agents"
    variant="panel"
    isCollapsed={isCollapsed}
  />
</Sidebar>

// Icon rail sidebar for project navigation
<Sidebar variant="rail" header={<ProjectIconButton />}>
  <SidebarItem
    icon={<Ticket className="size-5" />}
    label="Tickets"
    to="/projects/123/tickets"
    variant="rail"
  />
</Sidebar>
```

Props:
- `Sidebar`: `variant` (`"panel"` | `"rail"`), `isCollapsed`, `onCollapsedChange`, `header`, `footer`, `children`, `className`
- `SidebarItem`: `icon`, `label`, `to` (React Router path), `variant` (`"panel"` | `"rail"`), `isCollapsed` (panel mode)
- `rail` `Sidebar` renders a rounded, content-height shell with increased vertical spacing between icon items.
- `rail` `SidebarItem` renders as a circular bordered icon button (`size-12`) with tooltip labels and a stronger active border/ring state.

### BottomNav

```typescript
import { BottomNav } from '@kombuse/ui/components'

// Fixed bottom navigation bar for mobile viewports
<BottomNav projectId={projectId} />
```

Props:
- `projectId`: Project ID for building navigation URLs
- `className`: Optional class name

Shows 4 navigation items: Tickets, Chats, Agents, Labels. Active state matches current route via pathname. Includes iOS safe area padding.

### MobileListDetail

```typescript
import { MobileListDetail } from '@kombuse/ui/components'

// Mobile list/detail navigation wrapper
<MobileListDetail
  hasSelection={!!selectedId}
  onBack={() => navigate('/list')}
  backLabel="Items"
  list={<ListContent />}
  detail={<DetailContent />}
/>
```

Props:
- `hasSelection`: When false, renders `list` full-width. When true, renders back button + `detail`
- `onBack`: Callback when back button is clicked
- `list`: List view content
- `detail`: `ReactNode | ((props: { onBack: () => void }) => ReactNode)` — when a function, the back bar is hidden and `onBack` is passed to the detail component to render its own back button
- `backLabel`: Optional label for back button (default: "Back") — only used when `detail` is a plain ReactNode
- `className`: Optional class name

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
  pluginName="default"       // Optional: shows Puzzle icon + plugin name badge
  onClick={() => handleClick(label)}
/>

// Label detail/edit panel with triggers section
<LabelDetail
  label={label}
  projectId={projectId}
  pluginName="default"             // Optional: shows Puzzle icon + plugin name in header
  onClose={() => ...}
  onSave={(data) => ...}           // { name?, color?, description? }
  onDelete={() => ...}
  onNavigateToAgent={(agentId) => ...}
  isSaving={false}
  isDeleting={false}
/>

// Single-select dropdown for picking one label (used in trigger conditions)
// Shows Zap icon on labels with active agent triggers (smart labels)
<LabelPicker
  availableLabels={projectLabels}
  selectedLabelId={selectedId}
  onSelect={(labelId) => setSelectedId(labelId)}
  onLabelCreate={(data) => createLabel(data)}  // Optional: enables inline creation
  placeholder="Select a label..."
/>

// Multi-select dropdown for assigning labels (with optional CRUD)
// onLabelCreate is async: return the created Label to auto-assign it via onLabelAdd
<LabelSelector
  availableLabels={projectLabels}
  selectedLabelIds={[1, 2]}
  onLabelAdd={(labelId) => ...}
  onLabelRemove={(labelId) => ...}
  onLabelCreate={async (data) => { const label = await createLabel(data); return label }}
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
// When a milestone is selected, renders as a badge-style trigger (colored pill).
// When no milestone is selected, renders as an outline button.
<MilestoneSelector
  availableMilestones={projectMilestones}
  selectedMilestoneId={ticket.milestone_id ?? null}
  onSelect={(milestoneId) => updateTicket({ milestone_id: milestoneId })}
  onMilestoneCreate={(data) => createMilestone(data)}
  isCreating={isCreating}
  placeholder="Set milestone..."
  showProgress  // Display progress (closed/total) in badge-style trigger
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
import { AuthorFilterPicker, getAuthorFilterLabel } from '@kombuse/ui/components'
import { AllowedInvokersEditor, summarizeInvokers } from '@kombuse/ui/components'

// Mention type picker for trigger conditions (select between @profile and #ticket)
<MentionTypePicker
  value={selectedMentionType}
  onValueChange={(type) => setSelectedMentionType(type)}
  disabled={false}
/>

// Comment author filter for trigger conditions (human users, agents, or specific agents)
<AuthorFilterPicker
  value={{ authorType: selectedAuthorType, authorIds: selectedAuthorIds }}
  onValueChange={({ authorType, authorIds }) => {
    setSelectedAuthorType(authorType)
    setSelectedAuthorIds(authorIds)
  }}
  disabled={false}
/>

// Get human-readable label for a mention type
getMentionTypeLabel('profile') // => "Profile mention (@)"
getMentionTypeLabel('ticket')  // => "Ticket mention (#)"

// Get human-readable label for an author filter
getAuthorFilterLabel('user')                       // => "Human only"
getAuthorFilterLabel('agent')                      // => "Agent only"
getAuthorFilterLabel('agent', ['Alice', 'Bob'])    // => "Agents: Alice, Bob"
```

Props for `MentionTypePicker`:
- `value`: `MentionType | null` — current selection
- `onValueChange`: `(value: MentionType) => void` — selection callback
- `disabled`: Optional boolean

Props for `AuthorFilterPicker`:
- `value`: `{ authorType: ActorType | null; authorIds: string[] }` — current selection
- `onValueChange`: `(value: { authorType: ActorType | null; authorIds: string[] }) => void` — selection callback
- `disabled`: Optional boolean
- `projectId`: Optional string — scopes agent list to a specific project (+ global agents)
- When `authorType` is `'agent'`, shows a multi-select dropdown of enabled agents
- Leaving agent selection empty means "any agent"

#### AllowedInvokersEditor

Editor for trigger invoker restrictions (ACL). Provides a toggle between "Allow all" (null) and "Restrict to specific invokers" (array of rules). When restricted, users can add/remove rules with type selectors (Anyone, Human users, Agent, System). When "Agent" is selected, shows a searchable agent picker dropdown for selecting a specific agent by name, and a Select dropdown for agent type (dynamically populated from enabled agents).

```typescript
<AllowedInvokersEditor
  value={allowedInvokers}
  onChange={(value) => setAllowedInvokers(value)}
  disabled={false}
/>

// Get human-readable summary of invoker rules (with optional name resolution)
summarizeInvokers([{ type: 'user' }])                                      // => "Users"
summarizeInvokers([{ type: 'agent', agent_type: 'coder' }])                // => "type:coder"
summarizeInvokers([{ type: 'agent', agent_id: 'abc-123' }], profileMap)    // => "My Agent" (resolved)
```

Props for `AllowedInvokersEditor`:
- `value`: `AllowedInvoker[] | null` — current invoker rules (null = allow all)
- `onChange`: `(value: AllowedInvoker[] | null) => void` — called when rules change
- `disabled`: Optional boolean
- `projectId`: Optional string — scopes agent list to a specific project (+ global agents)

`summarizeInvokers` accepts an optional second parameter `profileMap: Map<string, Profile>` for resolving agent UUIDs to display names. When omitted, falls back to truncated UUID display.

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
import { TicketList, TicketListHeader, TicketDetail, TicketFilterSheet } from '@kombuse/ui/components'

// Render a ticket list with date metadata aligned to the active sort mode
<TicketList
  tickets={tickets}
  header={(
    <TicketListHeader
      title="Tickets"
      controls={<button>Create Ticket</button>}
    />
  )}
  sortBy="closed_at"
  selectedTicketNumber={selectedTicketNumber}
  onTicketClick={setSelectedTicket}
/>

// Display ticket details with optional editing
<TicketDetail
  onClose={() => setSelectedTicket(null)}
  isEditable={true}
  onEditModeChange={(mode) => {
    if (mode === 'edit') scrollToTop()
  }}
/>
```

Props:
- `TicketList`:
  - `tickets`: `TicketWithLabels[]`
  - `className`: Optional class name
  - `header`: Optional header content rendered inside the list card surface (above the scroll viewport)
  - `emptyMessage`: Optional empty/loading/error message content
  - `selectedTicketNumber`: Optional selected ticket number for active row styling
  - `onTicketClick`: `(ticket: TicketWithLabels) => void`
  - `sortBy`: Optional sort field (`created_at`, `updated_at`, `opened_at`, `last_activity_at`, `closed_at`); controls which timestamp is shown in each row metadata line
  - When `sortBy` is `closed_at` and a row has `closed_at = null`, the list shows `Not closed` instead of substituting another date
- `className`: Optional class name for styling
- `onClose`: Callback when close button is clicked
- `isEditable`: When `true`, enables:
  - Edit button to toggle edit mode (title, description, status)
  - Delete button with confirmation dialog before permanent removal
  - Label management
- `onEditModeChange`: Optional `(mode: 'view' | 'edit') => void` callback fired when the user enters or exits edit mode. Useful for scrolling the parent container to top when editing begins
- Edit mode supports image attachments via paperclip button, drag-and-drop, and clipboard paste. Staged files are uploaded on save
- View mode displays ticket attachments as clickable thumbnails with lightbox
- Delete confirmation warns that related comments and attachments are also removed; confirm action shows `Deleting...` while pending
- If delete fails, the dialog stays open so users can retry after the app-level error toast
- Header stays sticky on desktop (`md:sticky`) with elevated separation (`z-20`, `shadow-md`) and translucent blur treatment while content scrolls beneath. On mobile, the header scrolls with the content
- `onBack`: Optional `() => void` — when provided, renders a back arrow button at the start of the header row (used on mobile to navigate back to the ticket list)
- View mode uses semantic heading markup (`h1`) with `leading-tight`, and keeps created date in a secondary metadata row
- In editable view mode, the trigger switch is grouped with header actions and is hidden while editing

`TicketFilterSheet` — Mobile bottom-sheet filter panel for the ticket list:

```typescript
<TicketFilterSheet
  statusFilter={statusFilter}
  onStatusFilterChange={setStatusFilter}
  sortBy={sortBy}
  onSortByChange={setSortBy}
  sortOrder={sortOrder}
  onSortOrderToggle={toggleSortOrder}
  showClosedSort={showClosedSort}
  labels={labels}
  selectedLabelIds={selectedLabelIds}
  onLabelToggle={toggleLabel}
  onLabelsClear={clearLabels}
  milestones={milestones}
  selectedMilestoneId={selectedMilestoneId}
  onMilestoneToggle={toggleMilestone}
  onMilestoneClear={clearMilestone}
  statusCounts={statusCounts}
  activeFilterCount={activeFilterCount}
/>
```

- Renders a `Sheet` trigger button with `SlidersHorizontal` icon + "Filters" label + count badge
- Opens a bottom sheet with status, sort, label, and milestone filter sections
- Filters apply immediately on selection (no "Apply" button)
- Designed for use with `TicketListHeader`'s `mobileFilterTrigger` prop

`TicketListHeader` additional props:
- `mobileFilterTrigger`: Optional `ReactNode` — when provided, hides `meta` and `filters` on mobile and renders this trigger element next to the title instead

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
- `header`: Optional header content rendered inside the card list shell (`variant="card"`)
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

```typescript
import { PermissionRulesTab } from '@kombuse/ui/components'

// Read-only view of all agents' permission rules, grouped by agent
<PermissionRulesTab />
```

`PermissionRulesTab` is a self-fetching component that uses `useAgents()` and `useAgentProfiles()` internally. It displays all agents that have permission rules configured, grouped by agent name. No props are required.

`PermissionRulesTab` props:
- `className`: Optional class name
- `projectId`: Optional string — scopes agent list to a specific project (+ global agents)

```typescript
import { AutoApprovedToolsTab } from '@kombuse/ui/components'

// Editable view of per-agent auto-approved tools and bash commands
<AutoApprovedToolsTab projectId="my-project" />
```

`AutoApprovedToolsTab` is a self-fetching component that uses `useAgents()`, `useAgentProfiles()`, and `useUpdateAgent()` internally. It displays all agents with their auto-approved tool lists and allows editing per-agent overrides (stored in the agent's `config` JSON column). Supports toggling individual tools, adding custom tools, managing bash command prefixes, and resetting to type preset defaults.

`AutoApprovedToolsTab` props:
- `className`: Optional class name
- `projectId`: Optional string — scopes agent list to a specific project (+ global agents)

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

// Read-only list (no action buttons)
<PermissionRuleList permissions={permissions} />

// Single permission rule display
<PermissionRuleItem
  permission={permission}
  onEdit={() => handleEdit()}
  onDelete={() => handleDelete()}
/>

// Read-only display (no action buttons)
<PermissionRuleItem permission={permission} />
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
- `onEdit`: Optional `(index: number) => void` — called with the index of the permission to edit. When omitted, items render without edit buttons
- `onDelete`: Optional `(index: number) => void` — called with the index of the permission to delete. When omitted, items render without delete buttons

`PermissionRuleItem` props:
- `permission`: `Permission` — the permission to display
- `onEdit`: Optional `() => void` — edit callback. When omitted, edit button is hidden
- `onDelete`: Optional `() => void` — delete callback. When omitted, delete button is hidden
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
- `projectId`: Optional `string | null` — scopes agent list to a specific project (+ global agents)

Features:
- Popover with searchable agent list (only shows enabled agents with `enabled_for_chat` config)
- Shift+Tab keyboard shortcut cycles through available agents
- "No agent" option for plain chat sessions

### Agent Components

```typescript
import { AgentCard, AgentDetail, AgentHoverCard, AgentPreviewCard } from '@kombuse/ui/components'

// Card for agent list view — shows name, avatar, toggle, and agent ID
<AgentCard
  agent={agent}
  profile={profile}
  isSelected={isSelected}
  pluginName="default"       // Optional: shows Puzzle icon + plugin name badge
  onClick={() => handleSelect(agent.id)}
  onToggle={(enabled) => handleToggle(agent.id, enabled)}
  isToggling={false}
/>

// Detail panel — tabbed editor with copyable agent ID in the header
<AgentDetail
  agent={agent}
  profile={profile}
  triggers={triggers}
  pluginName="default"       // Optional: shows Puzzle icon + plugin name in header
  onClose={() => ...}
  onSave={(updates) => ...}
  onDelete={() => ...}
/>

// Hover any agent name/label to show critical details (lazy fetched)
<AgentHoverCard agentId={agent.id}>
  <span className="font-medium">{profile.name}</span>
</AgentHoverCard>

// Preview content used by AgentHoverCard (also usable standalone)
<AgentPreviewCard agentId={agent.id} />
```

Both `AgentCard` and `AgentDetail` display the agent ID (`agent.id`) so users can easily reference it in trigger conditions. `AgentDetail` includes a click-to-copy button next to the ID.

`AgentDetail` is split into two tabs:
- `Basic Info`: name, description, avatar, system prompt, and collapsible include sections (when `{% include %}` directives are present)
- `Configuration`: available-in-chat toggle, backend override, model override, permissions, triggers
- Tab switches preserve in-progress editor state (for example unsaved permission/trigger drafts)
- Save action: rendered in a persistent footer and shown only when there are unsaved changes

`PromptIncludeSections` — self-contained collapsible sections for included files:
- Each `{% include %}` directive resolves to a collapsible section with file path, expand/collapse chevron, and "Modified" badge
- Collapsed by default; expanding reveals read-only file content
- Inline edit mode with Save/Cancel actions
- Props: `files: PluginFile[]`, `isLoading?: boolean`, `onFileUpdate?: (fileId: number, content: string) => Promise<void>`

`AgentHoverCard` props:
- `agentId`: target agent ID
- `children`: trigger node rendered inline

`AgentPreviewCard` props:
- `agentId`: target agent ID
- `enabled`: optional lazy-load flag (defaults to true)
- `onError`: optional callback when data loading fails
- "View full details" link reads `currentProjectId` from `useCurrentProject()` context to build project-scoped URLs (`/projects/:projectId/agents/:agentId`)

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

// Fill available panel height (for split/detail panes)
<PromptEditor
  value={prompt}
  onChange={setPrompt}
  showAvailableVariables
  fillHeight
/>
```

Props:
- `value`: Prompt text value
- `onChange`: Callback when text changes
- `placeholder`: Input placeholder (default: "Enter your system prompt...")
- `disabled`: Disable editing
- `className`: Additional CSS class
- `minHeight` / `maxHeight`: Textarea height constraints (default: 200 / 500)
- `fillHeight`: Opt-in full-height mode (`h-full min-h-0 flex-1`) for layouts where the editor should consume remaining vertical space. In this mode, fixed `minHeight`/`maxHeight` constraints are not applied.
- `fillHeight` in constrained panels: Keep the surrounding form/tab container scrollable (`overflow-y-auto`) so helper content and adjacent fields remain reachable at smaller heights.
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
- `sessionId`: Optional kombuse session ID string — available in the Backend details popover for debugging
- `backendSessionId`: Optional Claude backend session ID — available in the Backend details popover for debugging
- `agentName`: Optional agent name string — when provided, displays the agent name in the header bar

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

`PermissionResponseRenderer` (in `renderers/`):
- Subtle inline renderer for `permission_response` events (allow/deny)
- Renders a single muted line with check/X icon, behavior text, resolved tool name, and timestamp
- Matches the `process_spawn` inline style (no card wrapper)
- Accepts optional `toolName` prop resolved from the matching `permission_request` event

`InitRenderer` (in `renderers/`):
- Minimal one-liner renderer for `init` raw events (session initialization)
- Displays model name and Claude Code version inline with timestamp
- Follows the same inline pattern as `process_spawn` (no card wrapper)

`task_started` inline renderer (in `session-viewer.tsx`):
- Minimal one-liner for `task_started` raw events (agent sub-task spawned)
- Displays task description and optional task_type badge inline with timestamp
- Follows the same inline pattern as `process_spawn` (no card wrapper)

`RateLimitRenderer` (in `renderers/`):
- Status-aware `EventCard` for `rate_limit_event` raw events
- Three visual tiers: neutral (`allowed`), amber warning (`allowed_warning` with utilization %), red error (other statuses)
- Reads `data.rate_limit_info` with legacy fallback for `data.message` / `data.retry_after`

`ErrorRenderer` (in `renderers/`):
- Dedicated renderer for `error` session events
- Shows error name and user-facing message with destructive styling
- Formats escaped stack traces (`\\n`) into readable multiline output with both horizontal and vertical scrolling

`CompleteRenderer` (in `renderers/`):
- Dedicated renderer for `complete` session events
- Shows success/failure status, reason badge, and optional exit code
- Shows optional failure details (`errorMessage`, `resumeFailed`) when present

`AskUserDialog` props:
- `permission`: `SerializedAgentPermissionRequestEvent | null` — the pending permission request (dialog opens when non-null)
- `onRespond`: `(updatedInput: Record<string, unknown>) => void` — callback with the original input plus populated `answers` map
- `onDeny`: `() => void` — callback when user dismisses the dialog without answering
- Modal dialog (Radix Dialog) replacing the former inline `AskUserBar` bottom-bar
- **Compact mode** (1–2 questions): All questions on a single dialog page
- **Wizard mode** (3+ questions): Step-by-step navigation with progress indicator ("Step N of M"), Back/Next buttons, and a final Review step where users can click any answer to edit it
- **"Your call"** button per question: delegates to the agent by setting `AGENT_CHOICE_SENTINEL` (`"__agent_choice__"`) as the answer
- **"Skip all — agent decides"** global button: fills all unanswered questions with the sentinel and jumps to review
- **Other...** free-text input option per question
- **Multi-select** and **single-select** question support
- **Keyboard**: `Enter` advances/submits, `Escape` goes back or closes (with confirmation if answers exist)
- Returns `null` if `input.questions` is malformed or `permission` is null

`AskUserRenderer` (in `renderers/`):
- Read-only renderer for historical `AskUserQuestion` permission request events in the session timeline
- Optional `userAnswer` prop: when present, highlights the selected option per question with a check icon
- Displays "Agent decides" badge when the answer is the `AGENT_CHOICE_SENTINEL`
- Falls back to `PermissionRequestRenderer` if `input.questions` is malformed

`ChatImageGallery` (in `renderers/`):
- Renders inline image thumbnails for `ImageAttachment[]` data (base64 data URIs)
- Displays images in a flex-wrap row with max-height constraints
- Click-to-open lightbox with Radix Dialog, keyboard navigation (arrow keys), and close (Escape)
- Used by `MessageRenderer` to render user-sent images in chat messages

`PermissionBar` props:
- `permission`: `SerializedAgentPermissionRequestEvent` — the pending permission request
- `onRespond`: `(behavior: 'allow' | 'deny', message?: string, options?: { alwaysAllow?: boolean }) => void` — callback for user decision
- Three primary actions: Allow, Always Allow (persists to agent auto-approved config), Reject
- "Always Allow" sends `alwaysAllow: true` in the WebSocket response, which persists the tool (or bash command prefix) to the agent's `auto_approved_tools_override` / `auto_approved_bash_commands_override` config
- "Suggest" mode: reveals a text input for sending a denial message
- The `NotificationBell` default permission card also includes an "Always" button with the same behavior
- The notification popover uses `w-96` (384px) width with `flex-wrap` on the button row to accommodate 4 buttons without overflow

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
- `resumableSessionIds`: Optional `Set<string>` of kombuse_session_ids eligible for Resume/Rerun (most recent session per agent)
- `onResume`: `(kombuseSessionId: string, agentId: string) => void` — callback to resume an agent session
- `onRerun`: `(kombuseSessionId: string, agentId: string) => void` — callback to rerun an agent session with the original prompt
- `isUpdatingComment`, `isDeletingComment`: Loading states

Props for `CommentItem`:
- `comment`: `CommentWithAuthor` object
- `parentComment`: Optional `CommentWithAuthor` — when provided, renders a "Replying to {name}" indicator between the header and body
- `projectId`: Optional project ID — enables `#<number>` ticket link rendering in comment body and builds correct route for session links on agent comments
- `attachments`: Optional `Attachment[]` to display as inline image thumbnails below the comment body — clicking a thumbnail opens the image lightbox
- Edit mode supports image attachments via paperclip button, drag-and-drop, and clipboard paste. Staged files are passed to `onSaveEdit(stagedFiles?)` on save
- `isResumable`: Optional boolean — when true and the comment is from an agent, shows Resume/Rerun action buttons
- `onResume`, `onRerun`: Optional callbacks for Resume/Rerun actions

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
- `triggersEnabled`: Optional boolean — when `false` and the message contains `@`, shows an amber warning banner that agents won't respond to mentions. Also threads through to the mention autocomplete dropdown footer.
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
  useInitProject,
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

// Initialize project (scaffolds .mcp.json, AGENTS.md, .kombuse/)
const initProject = useInitProject()
initProject.mutate('project-id')
// Returns InitProjectResult with per-file outcomes (created/skipped/error)
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

### Analytics Hooks

```typescript
import {
  useSessionsPerDay, useDurationPercentiles, usePipelineStageDuration,
  useMostFrequentReads, useToolCallsPerSession, useSlowestTools, useToolCallVolume,
  useTicketBurndown,
} from '@kombuse/ui/hooks'

// Fetch daily session counts for a project (default: last 30 days)
const { data: sessionsPerDay, isLoading } = useSessionsPerDay('project-id', 30)
// Returns Array<{ date: string; count: number }> sorted ascending by date

// Fetch session duration percentiles per agent (completed sessions only)
const { data: durations } = useDurationPercentiles('project-id', 30)
// Returns Array<{ agent_id: string | null; agent_name: string | null; p50: number; p90: number; p99: number; avg: number; count: number }>
// Duration values are in milliseconds

// Fetch pipeline stage (invocation) duration per agent
const { data: stages } = usePipelineStageDuration('project-id', 30)
// Returns Array<{ agent_id: string; agent_name: string; avg_duration: number; p50: number; p90: number; count: number }>
// Duration values are in milliseconds

// Fetch most frequently read files (default: top 25, last 30 days)
const { data: reads } = useMostFrequentReads('project-id', 30, 25)
// Returns Array<{ file_path: string; read_count: number }> sorted by read_count descending

// Fetch tool call counts per session (optional agent_id filter)
const { data: callsPerSession } = useToolCallsPerSession('project-id', 30, 'agent-id')
// Returns Array<{ session_id: string; agent_id: string | null; agent_name: string; call_count: number }>

// Fetch slowest tools by p50/p90/p99 duration (excludes aborted calls)
const { data: slowest } = useSlowestTools('project-id', 30)
// Returns Array<{ tool_name: string; count: number; avg: number; p50: number; p90: number; p99: number }>
// Duration values are in milliseconds

// Fetch tool call volume (cost proxy) — total calls and session spread
const { data: volume } = useToolCallVolume('project-id', 30)
// Returns Array<{ tool_name: string; call_count: number; session_count: number }>

// Fetch ticket burndown data (optional milestone_id / label_id filters)
const { data: burndown } = useTicketBurndown('project-id', 30, milestoneId, labelId)
// Returns Array<{ date: string; total: number; open: number; closed: number; ideal: number | null }>
// ideal is computed from milestone due_date when milestoneId is provided
```

### Database Hooks

```typescript
import { useDatabaseTables, useDatabaseQuery } from '@kombuse/ui/hooks'

// Fetch all database tables and views
const { data: tablesResponse, isLoading, refetch } = useDatabaseTables()
// tablesResponse?.tables => DatabaseTableInfo[] (name, type)

// Execute a read-only database query
const { data: queryResult } = useDatabaseQuery({
  sql: 'SELECT * FROM tickets LIMIT 100',
  params: ['%search%'],  // Optional positional bind parameters
  limit: 100,            // Optional row limit (default: 100, max: 500)
})
// queryResult?.rows => DatabaseRow[]
// queryResult?.count => number
```

- `useDatabaseTables`: Fetches the list of tables and views
- `useDatabaseQuery`: Executes a read-only SQL query; disabled when `input?.sql` is falsy
  - Backend enforces max 500 rows and read-only validation

### Agent Hooks

```typescript
import {
  useAgents,
  useAgent,
  useAgentWithProfile,
  useAgentProfiles,
  useCreateAgent,
  useUpdateAgent,
  useUpdateProfile,
  useToggleAgent,
  useDeleteAgent,
  useExportAgents,
} from '@kombuse/ui/hooks'

// Fetch all agents (with optional filters)
const { data: agents } = useAgents({ is_enabled: true })

// Fetch a single agent
const { data: agent } = useAgent('agent-id')

// Fetch agent + profile together
const { data } = useAgentWithProfile('agent-id')
// data?.agent, data?.profile

// Fetch all agent profiles
const { data: profiles } = useAgentProfiles()

// CRUD mutations
const createAgent = useCreateAgent()
createAgent.mutate({ profile: { name: 'My Agent' }, agent: { system_prompt: '...' } })

const updateAgent = useUpdateAgent()
updateAgent.mutate({ id: 'agent-id', input: { system_prompt: '...' } })

const toggleAgent = useToggleAgent()
toggleAgent.mutate({ id: 'agent-id', is_enabled: false })

const deleteAgent = useDeleteAgent()
deleteAgent.mutate('agent-id')

// Export agents as markdown files to a directory
const exportAgents = useExportAgents()
exportAgents.mutate(
  { directory: '/path/to/export', agent_ids: ['agent-a', 'agent-b'] },
  {
    onSuccess: (result) => console.log(`Exported ${result.count} agents`),
    onError: (error) => console.error(error.message),
  }
)
// agent_ids is optional — omit to export all agents
// result: { count: number, files: string[], directory: string }
```

### Plugin Hooks

```typescript
import {
  useExportPlugin,
  useInstalledPlugins,
  useAvailablePlugins,
  useInstallPlugin,
  useUpdatePlugin,
  useUninstallPlugin,
} from '@kombuse/ui/hooks'

// Export agents and labels as a plugin package
const exportPlugin = useExportPlugin()
exportPlugin.mutate(
  {
    package_name: 'my-plugin',
    project_id: 'project-id',
    agent_ids: ['agent-a', 'agent-b'],
    description: 'My plugin description',
    overwrite: true,
  },
  {
    onSuccess: (result) => console.log(`Exported ${result.agent_count} agents and ${result.label_count} labels`),
    onError: (error) => console.error(error.message),
  }
)
// agent_ids is optional — omit to export all agents
// All project labels are automatically included
// result: { package_name, directory, agent_count, label_count, files }

// List installed plugins for a project
const { data: plugins, isLoading } = useInstalledPlugins('project-id')
// Returns Plugin[] (id, name, version, description, is_enabled, installed_at, ...)

// List available plugin packages on disk (project + global directories)
const { data: available } = useAvailablePlugins('project-id')
// Returns AvailablePlugin[] (name, version, description, directory, source, installed)

// Install a plugin package from disk
const installPlugin = useInstallPlugin()
installPlugin.mutate(
  { package_path: '/path/to/plugin', project_id: 'project-id', overwrite: false },
  {
    onSuccess: (result) => console.log(`Installed "${result.plugin_name}": ${result.agents_created} agents`),
    onError: (error) => {
      if (error.message === 'plugin_already_installed') {
        // Prompt user to overwrite
      }
    },
  }
)
// Invalidates both installed and available plugin queries on success

// Enable or disable an installed plugin (cascades to agents and triggers)
const updatePlugin = useUpdatePlugin()
updatePlugin.mutate({ id: 'plugin-id', input: { is_enabled: false } })

// Uninstall a plugin
const uninstallPlugin = useUninstallPlugin()
uninstallPlugin.mutate({ id: 'plugin-id', mode: 'orphan' })
// mode: 'orphan' — keep entities but unlink from plugin
// mode: 'delete' — remove all plugin agents, triggers, labels, and profiles

// Check for updates on an installed plugin
const { data: updateInfo } = useCheckPluginUpdates('plugin-id')
// Returns { plugin_id, plugin_name, has_update, current_version, latest_version?, feed_id? }

// Install a plugin from remote feeds (GitHub, HTTP, or configured filesystem)
const installRemote = useInstallRemotePlugin()
installRemote.mutate({ name: 'my-plugin', project_id: 'project-id' })
// Optionally specify version: { name: 'my-plugin', version: '1.2.0', project_id: '...' }

// Pull the latest version of an installed plugin
const pullUpdate = usePullPluginUpdate()
pullUpdate.mutate('plugin-id')
// Downloads latest version and reinstalls with overwrite: true
```

### Plugin Source Hooks

```typescript
import { usePluginSources, useUpdatePluginSources } from '@kombuse/ui/hooks'

// Fetch global + project plugin sources for a project
const { data: sources, isLoading } = usePluginSources('project-id')
// sources?.global_sources => PluginSourceConfig[] (read-only, from ~/.kombuse/config.json)
// sources?.project_sources => PluginSourceConfig[] (editable, from {project}/.kombuse/config.json)
// sources?.default_sources => DefaultSource[] (read-only scan locations: project plugins dir, global plugins dir, kombuse.dev registry)

// Replace all project-level plugin sources
const updateSources = useUpdatePluginSources()
updateSources.mutate({
  projectId: 'project-id',
  sources: [{ type: 'http', base_url: 'https://feed.example.com' }],
})
// Invalidates plugin-sources and plugins queries on success
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

// Fetch labels ordered by open-ticket usage count (desc, then name asc)
const { data: usageLabels } = useProjectLabels('project-id', {
  sort: 'usage',
  usage_scope: 'open',
})

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

```typescript
import { useSmartLabels } from '@kombuse/ui/hooks'

// Check if a label triggers an agent ("smart label")
const { smartLabelIds, isSmartLabel } = useSmartLabels()
// smartLabelIds: Set<number> — label IDs with enabled agent triggers
// isSmartLabel(labelId): boolean — true if the label triggers an agent
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

// Supported tools: Bash (command), Read/Edit (file_path),
// Write (file_path for Claude Code, reason+grantRoot for Codex),
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

## `data-testid` Convention

Components use `data-testid` attributes as stable selectors for agent automation and testing. Follow these patterns:

- **Static elements:** `{component}-{element}` — e.g. `sidebar`, `sidebar-collapse`, `chat-textarea`, `chat-send`
- **Dynamic items:** `{component}-{element}-{id}` — e.g. `ticket-item-42`, `comment-123`, `session-item-abc`
- **Named items:** derive from label/name prop, lowercased with hyphens — e.g. `sidebar-item-tickets`, `bottom-nav-item-agents`

All selectors are documented in `apps/docs/.kombuse/plugins/docs-tutorial-builder/files/ui-selectors.md`.

## Adding New Components

1. **Base components** (shadcn/ui): Add to `src/base/` and add an explicit named export in `src/base/index.ts`
2. **Domain components**: Add to `src/components/` and add an explicit named export in `src/components/index.ts` (import directly from the source file, not through an intermediate barrel)
3. **Hooks**: Add to `src/hooks/` and re-export from `src/hooks/index.ts`
4. **Providers**: Add to `src/providers/` and re-export from `src/providers/index.ts`

> **Note:** All barrel files use explicit named exports (no `export * from`). Small subdirectory barrels (agent-picker, chat-input, comments, timeline, sessions, sidebar) have been removed — `components/index.ts` imports directly from source files.
