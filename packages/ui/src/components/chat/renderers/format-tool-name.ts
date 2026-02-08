/**
 * Format an MCP tool name for display.
 * `mcp__server__tool_name` → `server[tool_name]`
 * Non-MCP names pass through unchanged.
 */
export function formatToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name
  const parts = name.split('__')
  if (parts.length < 3) return name
  const server = parts[1]
  const tool = parts.slice(2).join('__')
  return `${server}[${tool}]`
}
