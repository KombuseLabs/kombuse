import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PluginExportInput, PluginInstallInput } from '@kombuse/types'
import { pluginFilesApi, pluginsApi } from '../lib/api'

export function useExportPlugin() {
  return useMutation({
    mutationFn: (input: PluginExportInput) => pluginsApi.exportPlugin(input),
  })
}

export function useInstalledPlugins(projectId: string) {
  return useQuery({
    queryKey: ['plugins', 'installed', projectId],
    queryFn: () => pluginsApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useAvailablePlugins(projectId: string) {
  return useQuery({
    queryKey: ['plugins', 'available', projectId],
    queryFn: () => pluginsApi.available(projectId),
    enabled: !!projectId,
  })
}

export function useInstallPlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PluginInstallInput) => pluginsApi.install(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}

export function useUpdatePlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { is_enabled?: boolean } }) =>
      pluginsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['labels'] })
    },
  })
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: 'orphan' | 'delete' }) =>
      pluginsApi.uninstall(id, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plugins'] })
    },
  })
}

export function usePluginFiles(pluginId: string | null | undefined) {
  return useQuery({
    queryKey: ['plugin-files', pluginId],
    queryFn: () => pluginFilesApi.list(pluginId!),
    enabled: !!pluginId,
  })
}

export function useUpdatePluginFile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ pluginId, fileId, content }: { pluginId: string; fileId: number; content: string }) =>
      pluginFilesApi.update(pluginId, fileId, { content }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['plugin-files', variables.pluginId] })
    },
  })
}
