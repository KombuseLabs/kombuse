# Codex Backend

This backend runs `codex app-server` over stdio JSON-RPC and adapts Codex-native events into Kombuse `AgentEvent`s.

## What It Does

- Starts/stops a Codex app-server process.
- Initializes/resumes/starts turns via JSON-RPC.
- Translates Codex item lifecycle notifications into:
  - `message` (assistant text)
  - `tool_use`
  - `tool_result`
  - `permission_request`
  - `complete`
  - `error`
- Suppresses low-value transport/lifecycle chatter in normal mode.
- Emits raw events only in debug mode (`KOMBUSE_LOG_LEVEL=debug`) for diagnostics.

## Event Mapping (High Level)

- `item/agentMessage/delta` + `codex/event/agent_message_*_delta`
  - buffered and flushed into assistant `message` events.
- `item/started` / `item/completed`
  - `commandExecution` -> `tool_use` / `tool_result`
  - `fileChange` -> `tool_use` / `tool_result`
  - `mcpToolCall` -> `tool_use` / `tool_result`
  - `agentMessage` and `userMessage` lifecycle events are not surfaced as raw noise.
- `turn/completed`
  - emits `complete` (and `error` when turn status is not completed).

## Known Limits From "Claudification"

The current app architecture is still biased toward Claude-style assumptions. That introduces compromises for Codex:

- Single canonical assistant-text path.
  - Codex can emit text through both legacy and delta channels; we currently dedupe heuristically.
- Tool taxonomy is flattened.
  - Codex-specific tool metadata gets normalized into generic `Bash`/`Write`/`mcp__*` patterns.
- Permission flow is shape-constrained.
  - The app assumes a narrow approval model (`commandExecution` and `fileChange`) and may not express richer Codex policies.
- Structured output is partially lossy.
  - MCP `structuredContent` is passed through but rendered through generic result surfaces.
- Lifecycle semantics are constrained to one active turn model.
  - Works for current behavior, but it is not designed for richer concurrent/branching turn semantics.
- Observability is backend-uneven.
  - Server-side filtering was originally introduced for Claude normalization noise (`cli_pre_normalization`) and only later generalized for Codex.

## Short-Term Improvements (Low-Risk)

- Add a backend-agnostic event visibility policy (`user-facing`, `debug`, `internal`) instead of ad-hoc method filtering.
- Introduce stable message IDs across delta + final message paths to remove heuristic dedupe.
- Preserve richer tool metadata in typed payload extensions while keeping current UI compatible.
- Add Codex-focused integration tests that assert "no raw noise in normal mode" for common flows.

## Debugging

- Set `KOMBUSE_LOG_LEVEL=debug` to re-enable raw transport events.
- Keep it unset (or not `debug`) for normal user-facing chat output.
