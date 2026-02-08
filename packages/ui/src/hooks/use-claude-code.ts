import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { claudeCodeApi } from '../lib/api'

export function useClaudeCodeProjects() {
  return useQuery({
    queryKey: ['claude-code-projects'],
    queryFn: () => claudeCodeApi.scan(),
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
