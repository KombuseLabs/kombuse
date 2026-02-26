import { useQuery } from '@tanstack/react-query'
import { modelsApi } from '../lib/api'
import { modelKeys } from '../lib/query-keys'

export function useModels(backendType: string | undefined) {
  return useQuery({
    queryKey: modelKeys.list(backendType),
    queryFn: () => modelsApi.getModels(backendType!),
    enabled: !!backendType,
    staleTime: 5 * 60 * 1000,
  })
}
