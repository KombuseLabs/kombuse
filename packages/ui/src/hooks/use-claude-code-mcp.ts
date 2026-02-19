import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { claudeCodeMcpApi } from '../lib/api'

export function useClaudeCodeMcpStatus() {
  return useQuery({
    queryKey: ['claude-code-mcp-status'],
    queryFn: () => claudeCodeMcpApi.getMcpStatus(),
  })
}

export function useSetClaudeCodeMcpEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => claudeCodeMcpApi.setMcpEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['claude-code-mcp-status'],
      })
    },
  })
}
