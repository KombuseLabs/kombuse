import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { codexApi } from '../lib/api'
import { codexKeys } from '../lib/query-keys'

export function useCodexMcpStatus() {
  return useQuery({
    queryKey: codexKeys.mcpStatus,
    queryFn: () => codexApi.getMcpStatus(),
  })
}

export function useSetCodexMcpEnabled() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (enabled: boolean) => codexApi.setMcpEnabled(enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: codexKeys.mcpStatus,
      })
    },
  })
}
