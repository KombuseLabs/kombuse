import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { claudeCodeApi } from '../lib/api'

export function useClaudeCodeProjects() {
  return useQuery({
    queryKey: ['claude-code-projects'],
    queryFn: () => claudeCodeApi.scanProjects(),
  })
}

export function useImportClaudeCodeProjects() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (paths: string[]) => claudeCodeApi.importProjects(paths),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['claude-code-projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}

export function useClaudeCodeSessions(projectPath: string) {
  return useQuery({
    queryKey: ['claude-code-sessions', projectPath],
    queryFn: () => claudeCodeApi.listSessions(projectPath),
    enabled: !!projectPath,
    select: (data) => data.sessions,
  })
}

export function useClaudeCodeSessionContent(projectPath: string, sessionId: string) {
  return useQuery({
    queryKey: ['claude-code-session-content', projectPath, sessionId],
    queryFn: () => claudeCodeApi.getSessionContent(projectPath, sessionId),
    enabled: !!projectPath && !!sessionId,
  })
}
