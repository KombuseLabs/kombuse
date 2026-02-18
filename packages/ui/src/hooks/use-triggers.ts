import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
} from '@kombuse/types'
import { triggersApi, labelsApi } from '../lib/api'
import { useAppContext } from './use-app-context'

function useRefreshSmartLabels() {
  const { currentProjectId, setSmartLabelIds } = useAppContext()
  return () => {
    if (currentProjectId) {
      labelsApi.getSmartLabelIds(currentProjectId).then((ids) => {
        setSmartLabelIds(new Set(ids))
      }).catch(() => {})
    }
  }
}

export function useTriggers(agentId: string) {
  return useQuery({
    queryKey: ['triggers', agentId],
    queryFn: () => triggersApi.list(agentId),
    enabled: !!agentId,
  })
}

export function useTrigger(id: number) {
  return useQuery({
    queryKey: ['triggers', 'detail', id],
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
      queryClient.invalidateQueries({ queryKey: ['triggers', variables.agentId] })
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
      queryClient.invalidateQueries({ queryKey: ['triggers'] })
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
      queryClient.invalidateQueries({ queryKey: ['triggers'] })
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
      queryClient.invalidateQueries({ queryKey: ['triggers'] })
      refreshSmartLabels()
    },
  })
}

export function useTriggersByLabel(labelId: number) {
  return useQuery({
    queryKey: ['triggers', 'label', labelId],
    queryFn: () => triggersApi.listByLabel(labelId),
    enabled: labelId > 0,
  })
}
