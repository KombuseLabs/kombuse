import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AgentFilters,
  CreateAgentInput,
  UpdateAgentInput,
  CreateProfileInput,
  UpdateProfileInput,
} from '@kombuse/types'
import { agentsApi, profilesApi } from '../lib/api'

export function useAgents(filters?: AgentFilters) {
  return useQuery({
    queryKey: ['agents', filters],
    queryFn: () => agentsApi.list(filters),
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agents', id],
    queryFn: () => agentsApi.get(id),
    enabled: !!id,
  })
}

export function useAgentWithProfile(id: string) {
  return useQuery({
    queryKey: ['agents', id, 'with-profile'],
    queryFn: async () => {
      const [agent, profile] = await Promise.all([
        agentsApi.get(id),
        profilesApi.get(id),
      ])
      return { agent, profile }
    },
    enabled: !!id,
  })
}

export function useAgentProfiles() {
  return useQuery({
    queryKey: ['profiles', { type: 'agent' }],
    queryFn: () => profilesApi.list({ type: 'agent' }),
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      profile: Omit<CreateProfileInput, 'type'>
      agent: Omit<CreateAgentInput, 'id'>
    }) => {
      // 1. Create profile first (type: 'agent')
      const profile = await profilesApi.create({
        ...input.profile,
        type: 'agent',
      })
      // 2. Create agent referencing the profile
      const agent = await agentsApi.create({
        ...input.agent,
        id: profile.id,
      })
      return { agent, profile }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAgentInput }) =>
      agentsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProfileInput }) =>
      profilesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useToggleAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      agentsApi.update(id, { is_enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents'] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}
