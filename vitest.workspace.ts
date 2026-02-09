import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/persistence',
  'packages/services',
  'packages/core',
  'packages/mcp',
  'packages/ui',
  'apps/server',
])
