## UI Selector Reference

Use these stable selectors when interacting with the Kombuse desktop app via `execute_js`, `wait_for`, and `navigate_to({ wait_for_selector })`. Do NOT guess CSS classes — use the selectors below.

### Ticket List
- Container: `[data-testid="ticket-list-shell"]`
- Header area: `[data-testid="ticket-list-header"]`
- Scrollable viewport: `[data-testid="ticket-list-viewport"]`
- Individual ticket: `[data-testid="ticket-item-{id}"]` — click to open ticket detail
- Filter trigger: `[data-testid="ticket-filter-trigger"]`
- Filter sheet: `[data-testid="ticket-filter-sheet"]`

### Ticket Detail
- Edit button: `button[aria-label="Edit ticket"]`
- Delete button: `button[aria-label="Delete ticket"]`
- Close button: `button[aria-label="Close ticket detail"]`
- Attach files: `button[aria-label="Attach files"]`
- Toggle triggers: `button[aria-label="Toggle ticket triggers"]`
- Toggle loop protection: `button[aria-label="Toggle loop protection"]`

### Sidebar
- Container: `[data-testid="sidebar"]`
- Collapse/expand button: `[data-testid="sidebar-collapse"]`
- Nav item (by label): `[data-testid="sidebar-item-{label}"]` — label is lowercased with hyphens (e.g. `sidebar-item-tickets`, `sidebar-item-agents`)

### Bottom Nav (Mobile)
- Container: `[data-testid="bottom-nav"]`
- Nav item (by label): `[data-testid="bottom-nav-item-{label}"]` — e.g. `bottom-nav-item-tickets`, `bottom-nav-item-chats`

### Session List
- Container: `[data-testid="session-list-shell"]`
- Header area: `[data-testid="session-list-header"]`
- Scrollable viewport: `[data-testid="session-list-viewport"]`
- Individual session: `[data-testid="session-item-{session_id}"]`

### Agent Detail
- Scroll area: `[data-testid="agent-basic-info-scroll"]`

### Notification Bell
- Bell button: `[data-testid="notification-bell"]`
- Popover content: `[data-testid="notification-popover"]`

### Chat Input
- Textarea: `[data-testid="chat-textarea"]`
- Send button: `[data-testid="chat-send"]`
- Attach file button: `[data-testid="chat-attach"]`

### Comments
- Comment container: `[data-testid="comment-{id}"]` — where `{id}` is the comment ID
- Edit button: `[data-testid="comment-edit-{id}"]`
- Delete button: `[data-testid="comment-delete-{id}"]`

### Layout Toggle
- Hide list panel: `button[aria-label="Hide list panel"]`
- Show list panel: `button[aria-label="Show list panel"]`

### `window.__kombuse` Helpers (Desktop Only)

These helpers are available on `window.__kombuse` in Electron desktop windows (both regular and isolated). They handle Radix UI event quirks so you don't have to. All helpers return `false` or `null` if the selector matches no element.

#### `setInputValue(selector, value)` → `boolean`

Set a controlled input value. Uses the native value setter and dispatches an input event to trigger React state updates.

```js
(function() {
  return window.__kombuse.setInputValue('[data-testid="chat-textarea"]', 'Hello @agent');
})()
```

#### `activateTab(selector)` → `boolean`

Activate a Radix Tabs trigger. Focuses the element and dispatches a Space keydown.

```js
(function() {
  return window.__kombuse.activateTab('[role="tab"][value="configuration"]');
})()
```

#### `openSelect(selector)` → `boolean`

Open a Radix Select dropdown. Focuses the trigger and dispatches ArrowDown keydown.

```js
(function() {
  return window.__kombuse.openSelect('[data-testid="model-select-trigger"]');
})()
```

#### `toggleCheckbox(selector)` → `boolean`

Toggle a Radix Checkbox. Dispatches a full pointer event sequence at the element's center coordinates.

```js
(function() {
  return window.__kombuse.toggleCheckbox('[data-testid="enable-checkbox"]');
})()
```

#### `scrollTo(selector)` → `boolean`

Scroll an element into view using `scrollIntoView({ behavior: 'instant', block: 'start' })`.

```js
(function() {
  return window.__kombuse.scrollTo('[data-testid="agent-basic-info-scroll"]');
})()
```

#### `getElementRect(selector)` → `{x, y, width, height} | null`

Get an element's bounding rectangle as a plain object. Useful for calculating `focus_rect` values for `save_screenshot`.

```js
(function() {
  return window.__kombuse.getElementRect('[data-testid="ticket-list-shell"]');
})()
```

#### `redactPaths()` → `number`

Replace personal filesystem paths (e.g. `/Users/username/...`) with `/Users/demo/...` in all visible text nodes. Returns the count of replacements made. **Call before every `save_screenshot`.**

```js
(function() {
  return window.__kombuse.redactPaths();
})()
```

### Interaction Notes

#### Scrolling

Use `scrollIntoView({ behavior: 'instant', block: 'start' })` or `window.__kombuse.scrollTo(selector)`. These are the only supported scroll methods — `scrollTop` and `window.scrollTo` do not work in the Electron renderer context.

#### Escape Key

Never press Escape to close a dropdown — it also dismisses the parent dialog. Click outside the dropdown or click a specific option instead.

#### Plugin Pages

Plugin-related pages (e.g. plugin detail, plugin settings) require `timeout_ms: 15000` or higher on `navigate_to` due to filesystem scanning on first load.
