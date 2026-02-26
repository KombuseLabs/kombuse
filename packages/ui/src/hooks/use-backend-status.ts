import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { backendStatusApi } from '../lib/api'
import { backendStatusKeys } from '../lib/query-keys'

export function useBackendStatus() {
  return useQuery({
    queryKey: backendStatusKeys.all,
    queryFn: () => backendStatusApi.getStatus(),
    staleTime: 60_000,
  })
}

export function useRefreshBackendStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => backendStatusApi.refreshStatus(),
    onSuccess: (data) => {
      queryClient.setQueryData(backendStatusKeys.all, data)
    },
  })
}
