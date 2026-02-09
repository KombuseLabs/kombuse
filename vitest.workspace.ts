import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/persistence',
  'packages/services',
  'packages/mcp',
  'packages/ui',
  'packages/agent',
  'apps/server',
])
