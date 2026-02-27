import type {
  Profile,
  ProfileFilters,
  CreateProfileInput,
  UpdateProfileInput,
} from '@kombuse/types'
import { profilesRepository } from '@kombuse/persistence'

export class ProfileService {
  list(filters?: ProfileFilters): Profile[] {
    return profilesRepository.list(filters)
  }

  get(id: string): Profile | null {
    return profilesRepository.get(id)
  }

  create(input: CreateProfileInput): Profile {
    return profilesRepository.create(input)
  }

  update(id: string, input: UpdateProfileInput): Profile {
    const existing = profilesRepository.get(id)
    if (!existing) {
      throw new Error(`Profile ${id} not found`)
    }

    const updated = profilesRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update profile ${id}`)
    }

    return updated
  }

  delete(id: string): void {
    const success = profilesRepository.delete(id)
    if (!success) {
      throw new Error(`Profile ${id} not found`)
    }
  }
}

// Singleton instance for convenience
export const profileService = new ProfileService()
