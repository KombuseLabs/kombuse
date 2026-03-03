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

### Programmatic Input Helper (Desktop Only)

To set a controlled input value (e.g. to type into the chat textarea and trigger mention autocomplete):

```js
(function() {
  return window.__kombuse.setInputValue('[data-testid="chat-textarea"]', 'Hello @agent');
})()
```

This properly triggers React state updates and mention autocomplete detection. Returns `true` on success, `false` if the element was not found.
