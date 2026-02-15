import { useQuery } from '@tanstack/react-query'
import { modelsApi } from '../lib/api'

export function useModels(backendType: string | undefined) {
  return useQuery({
    queryKey: ['models', backendType],
    queryFn: () => modelsApi.getModels(backendType!),
    enabled: !!backendType,
    staleTime: 5 * 60 * 1000,
  })
}
