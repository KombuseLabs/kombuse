import { useQuery } from '@tanstack/react-query'
import { profilesApi } from '../lib/api'
import { profileKeys } from '../lib/query-keys'

export function useProfile(id: string) {
  return useQuery({
    queryKey: profileKeys.detail(id),
    queryFn: () => profilesApi.get(id),
    enabled: !!id,
  })
}

/**
 * Fetch the current user's profile.
 * Hardcoded to "user-1" until auth is implemented (#44).
 */
export function useCurrentUserProfile() {
  return useProfile('user-1')
}
