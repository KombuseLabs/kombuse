import { useQuery } from '@tanstack/react-query'
import type { PermissionLogFilters } from '@kombuse/types'
import { permissionsApi } from '../lib/api'

export function usePermissions(
  projectId: string,
  filters?: Omit<PermissionLogFilters, 'project_id'>
) {
  return useQuery({
    queryKey: ['permissions', projectId, filters],
    queryFn: () => permissionsApi.list(projectId, filters),
    enabled: !!projectId,
  })
}
