import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { PluginSourceConfig } from '@kombuse/types'
import { pluginSourcesApi } from '../lib/api'

export function usePluginSources(projectId: string) {
  return useQuery({
    queryKey: ['plugin-sources', projectId],
    queryFn: () => pluginSourcesApi.get(projectId),
    enabled: !!projectId,
  })
}

export function useUpdatePluginSources() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      projectId,
      sources,
    }: {
      projectId: string
      sources: PluginSourceConfig[]
    }) => pluginSourcesApi.update(projectId, sources),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['plugin-sources', variables.projectId],
      })
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })
}
