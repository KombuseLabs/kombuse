import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { claudeCodeApi } from '../lib/api'
import { claudeCodeKeys, projectKeys } from '../lib/query-keys'

export function useClaudeCodeProjects() {
  return useQuery({
    queryKey: claudeCodeKeys.projects,
    queryFn: () => claudeCodeApi.scanProjects(),
  })
}

export function useImportClaudeCodeProjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]) => claudeCodeApi.importProjects(paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: claudeCodeKeys.projects })
      queryClient.invalidateQueries({ queryKey: projectKeys.all })
    },
  })
}

export function useClaudeCodeSessions(projectPath: string) {
  return useQuery({
    queryKey: claudeCodeKeys.sessions(projectPath),
    queryFn: () => claudeCodeApi.listSessions(projectPath),
    enabled: !!projectPath,
    select: (data) => data.sessions,
  })
}

export function useClaudeCodeSessionContent(projectPath: string, sessionId: string) {
  return useQuery({
    queryKey: claudeCodeKeys.sessionContent(projectPath, sessionId),
    queryFn: () => claudeCodeApi.getSessionContent(projectPath, sessionId),
    enabled: !!projectPath && !!sessionId,
  })
}
