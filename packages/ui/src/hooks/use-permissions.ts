import { useQuery } from '@tanstack/react-query'
import type { PermissionLogFilters } from '@kombuse/types'
import { permissionsApi } from '../lib/api'
import { permissionKeys } from '../lib/query-keys'

export function usePermissions(
  projectId: string,
  filters?: Omit<PermissionLogFilters, 'project_id'>
) {
  return useQuery({
    queryKey: permissionKeys.list(projectId, filters),
    queryFn: () => permissionsApi.list(projectId, filters),
    enabled: !!projectId,
  })
}
