import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { codexApi } from '../lib/api'

export function useCodexMcpStatus() {
  return useQuery({
    queryKey: ['codex-mcp-status'],
    queryFn: () => codexApi.getMcpStatus(),
  })
}

export function useSetCodexMcpEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => codexApi.setMcpEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['codex-mcp-status'],
      })
    },
  })
}
