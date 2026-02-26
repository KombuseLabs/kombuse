import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  AgentFilters,
  UpdateAgentInput,
  UpdateProfileInput,
} from '@kombuse/types'
import { agentsApi, profilesApi } from '../lib/api'
import { agentKeys, profileKeys } from '../lib/query-keys'

export function useAgents(filters?: AgentFilters) {
  return useQuery({
    queryKey: agentKeys.list(filters),
    queryFn: () => agentsApi.list(filters),
  })
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: agentKeys.detail(id),
    queryFn: () => agentsApi.get(id),
    enabled: !!id,
  })
}

export function useAgentWithProfile(id: string) {
  return useQuery({
    queryKey: agentKeys.withProfile(id),
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
    queryKey: profileKeys.agentProfiles(),
    queryFn: () => profilesApi.list({ type: 'agent' }),
  })
}

export function useCreateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description: string
      avatar_url?: string
      system_prompt: string
      is_enabled?: boolean
      project_id?: string
    }) => {
      // Service auto-creates profile with name + description
      const agent = await agentsApi.create({
        name: input.name,
        description: input.description,
        system_prompt: input.system_prompt,
        is_enabled: input.is_enabled,
        project_id: input.project_id,
      })
      // Avatar is a profile-only field; update separately if provided
      if (input.avatar_url) {
        await profilesApi.update(agent.id, { avatar_url: input.avatar_url })
      }
      return agent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useUpdateAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAgentInput }) =>
      agentsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProfileInput }) =>
      profilesApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useToggleAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, is_enabled }: { id: string; is_enabled: boolean }) =>
      agentsApi.update(id, { is_enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
    },
  })
}

export function useDeleteAgent() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => agentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.all })
      queryClient.invalidateQueries({ queryKey: profileKeys.all })
    },
  })
}

export function useExportAgents() {
  return useMutation({
    mutationFn: (input: { directory: string; agent_ids?: string[] }) =>
      agentsApi.export(input),
  })
}
