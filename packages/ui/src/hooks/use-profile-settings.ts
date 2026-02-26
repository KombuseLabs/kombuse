import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { profileSettingsApi } from '../lib/api'
import type { UpsertProfileSettingInput } from '@kombuse/types'
import { profileSettingKeys } from '../lib/query-keys'

export function useProfileSetting(profileId: string, key: string) {
  return useQuery({
    queryKey: profileSettingKeys.detail(profileId, key),
    queryFn: () => profileSettingsApi.get(profileId, key),
    enabled: !!profileId && !!key,
    retry: false,
  })
}

export function useProfileSettings(profileId: string) {
  return useQuery({
    queryKey: profileSettingKeys.all(profileId),
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
        queryKey: profileSettingKeys.detail(data.profile_id, data.setting_key),
      })
      queryClient.invalidateQueries({
        queryKey: profileSettingKeys.all(data.profile_id),
        exact: true,
      })
    },
  })
}
