import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
} from '@kombuse/types'
import { createBrowserLogger } from '@kombuse/core/browser-logger'
import { triggersApi, labelsApi } from '../lib/api'

const logger = createBrowserLogger('Triggers')
import { triggerKeys } from '../lib/query-keys'
import { useAppContext } from './use-app-context'

function useRefreshSmartLabels() {
  const { currentProjectId, setSmartLabelIds } = useAppContext()
  return useCallback(() => {
    if (currentProjectId) {
      labelsApi.getSmartLabelIds(currentProjectId).then((ids) => {
        setSmartLabelIds(new Set(ids))
      }).catch((err) => logger.error('Failed to refresh smart label IDs', { error: err instanceof Error ? err.message : String(err) }))
    }
  }, [currentProjectId, setSmartLabelIds])
}

export function useTriggers(agentId: string) {
  return useQuery({
    queryKey: triggerKeys.byAgent(agentId),
    queryFn: () => triggersApi.list(agentId),
    enabled: !!agentId,
  })
}

export function useTrigger(id: number) {
  return useQuery({
    queryKey: triggerKeys.detail(id),
    queryFn: () => triggersApi.get(id),
    enabled: !!id,
  })
}

export function useCreateTrigger() {
  const queryClient = useQueryClient()
  const refreshSmartLabels = useRefreshSmartLabels()
  return useMutation({
    mutationFn: ({
      agentId,
      input,
    }: {
      agentId: string
      input: Omit<CreateAgentTriggerInput, 'agent_id'>
    }) => triggersApi.create(agentId, input),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.byAgent(variables.agentId) })
      refreshSmartLabels()
    },
  })
}

export function useUpdateTrigger() {
  const queryClient = useQueryClient()
  const refreshSmartLabels = useRefreshSmartLabels()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateAgentTriggerInput }) =>
      triggersApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all })
      refreshSmartLabels()
    },
  })
}

export function useDeleteTrigger() {
  const queryClient = useQueryClient()
  const refreshSmartLabels = useRefreshSmartLabels()
  return useMutation({
    mutationFn: (id: number) => triggersApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all })
      refreshSmartLabels()
    },
  })
}

export function useToggleTrigger() {
  const queryClient = useQueryClient()
  const refreshSmartLabels = useRefreshSmartLabels()
  return useMutation({
    mutationFn: ({ id, is_enabled }: { id: number; is_enabled: boolean }) =>
      triggersApi.update(id, { is_enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: triggerKeys.all })
      refreshSmartLabels()
    },
  })
}

export function useTriggersByLabel(labelId: number) {
  return useQuery({
    queryKey: triggerKeys.byLabel(labelId),
    queryFn: () => triggersApi.listByLabel(labelId),
    enabled: labelId > 0,
  })
}
