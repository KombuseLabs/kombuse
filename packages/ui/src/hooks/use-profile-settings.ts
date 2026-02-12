import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileSettingsApi } from '../lib/api'
import type { UpsertProfileSettingInput } from '@kombuse/types'

export function useProfileSetting(profileId: string, key: string) {
  return useQuery({
    queryKey: ['profile-settings', profileId, key],
    queryFn: () => profileSettingsApi.get(profileId, key),
    enabled: !!profileId && !!key,
    retry: false,
  })
}

export function useProfileSettings(profileId: string) {
  return useQuery({
    queryKey: ['profile-settings', profileId],
    queryFn: () => profileSettingsApi.getAll(profileId),
    enabled: !!profileId,
  })
}

export function useUpsertProfileSetting() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertProfileSettingInput) =>
      profileSettingsApi.upsert(input),
    onSuccess: (data) => {
      queryClient.invalidateQueries({
        queryKey: ['profile-settings', data.profile_id, data.setting_key],
      })
      queryClient.invalidateQueries({
        queryKey: ['profile-settings', data.profile_id],
        exact: true,
      })
    },
  })
}
