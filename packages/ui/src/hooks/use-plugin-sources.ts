import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { PluginSourceConfig } from '@kombuse/types'
import { pluginSourcesApi } from '../lib/api'
import { pluginSourceKeys, pluginKeys } from '../lib/query-keys'

export function usePluginSources(projectId: string) {
  return useQuery({
    queryKey: pluginSourceKeys.list(projectId),
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
        queryKey: pluginSourceKeys.list(variables.projectId),
      })
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
    },
  })
}
