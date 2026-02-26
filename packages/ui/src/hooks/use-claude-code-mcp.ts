import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { claudeCodeMcpApi } from '../lib/api'
import { claudeCodeKeys } from '../lib/query-keys'

export function useClaudeCodeMcpStatus() {
  return useQuery({
    queryKey: claudeCodeKeys.mcpStatus,
    queryFn: () => claudeCodeMcpApi.getMcpStatus(),
  })
}

export function useSetClaudeCodeMcpEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => claudeCodeMcpApi.setMcpEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: claudeCodeKeys.mcpStatus,
      })
    },
  })
}
