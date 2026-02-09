import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/persistence',
  'packages/services',
  'packages/core',
  'packages/mcp',
  'apps/server',
])
