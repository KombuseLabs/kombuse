import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PluginExportInput, PluginInstallInput, PluginRemoteInstallInput } from '@kombuse/types'
import { pluginFilesApi, pluginsApi } from '../lib/api'
import { pluginKeys, pluginFileKeys, agentKeys, labelKeys, profileKeys } from '../lib/query-keys'

export function useExportPlugin() {
  return useMutation({
    mutationFn: (input: PluginExportInput) => pluginsApi.exportPlugin(input),
  })
}

export function useInstalledPlugins(projectId: string) {
  return useQuery({
    queryKey: pluginKeys.installed(projectId),
    queryFn: () => pluginsApi.list(projectId),
    enabled: !!projectId,
  })
}

export function useAvailablePlugins(projectId: string) {
  return useQuery({
    queryKey: pluginKeys.available(projectId),
    queryFn: () => pluginsApi.available(projectId),
    enabled: !!projectId,
  })
}

export function useInstallPlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PluginInstallInput) => pluginsApi.install(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: labelKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useUpdatePlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { is_enabled?: boolean } }) =>
      pluginsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: labelKeys.all })
    },
  })
}

export function useUninstallPlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode }: { id: string; mode?: 'orphan' | 'delete' }) =>
      pluginsApi.uninstall(id, mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
    },
  })
}

export function usePluginFiles(pluginId: string | null | undefined) {
  return useQuery({
    queryKey: pluginFileKeys.list(pluginId),
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
      queryClient.invalidateQueries({ queryKey: pluginFileKeys.list(variables.pluginId) })
    },
  })
}

export function useCheckPluginUpdates(pluginId: string | null | undefined) {
  return useQuery({
    queryKey: pluginKeys.checkUpdates(pluginId),
    queryFn: () => pluginsApi.checkUpdates(pluginId!),
    enabled: !!pluginId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useInstallRemotePlugin() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PluginRemoteInstallInput) => pluginsApi.installRemote(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: labelKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function usePullPluginUpdate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pluginId: string) => pluginsApi.pull(pluginId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pluginKeys.all })
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: labelKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}
