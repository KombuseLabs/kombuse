import type {
  Milestone,
  MilestoneWithStats,
  MilestoneFilters,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from '@kombuse/types'
import { milestonesRepository } from '@kombuse/persistence'

export interface IMilestoneService {
  list(filters?: MilestoneFilters): Milestone[]
  listWithStats(filters?: MilestoneFilters): MilestoneWithStats[]
  get(id: number): Milestone | null
  getWithStats(id: number): MilestoneWithStats | null
  create(input: CreateMilestoneInput): Milestone
  update(id: number, input: UpdateMilestoneInput): Milestone
  delete(id: number): void
}

export class MilestoneService implements IMilestoneService {
  list(filters?: MilestoneFilters): Milestone[] {
    return milestonesRepository.list(filters)
  }

  listWithStats(filters?: MilestoneFilters): MilestoneWithStats[] {
    return milestonesRepository.listWithStats(filters)
  }

  get(id: number): Milestone | null {
    return milestonesRepository.get(id)
  }

  getWithStats(id: number): MilestoneWithStats | null {
    return milestonesRepository.getWithStats(id)
  }

  create(input: CreateMilestoneInput): Milestone {
    return milestonesRepository.create(input)
  }

  update(id: number, input: UpdateMilestoneInput): Milestone {
    const existing = milestonesRepository.get(id)
    if (!existing) {
      throw new Error(`Milestone ${id} not found`)
    }

    const updated = milestonesRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update milestone ${id}`)
    }

    return updated
  }

  delete(id: number): void {
    const success = milestonesRepository.delete(id)
    if (!success) {
      throw new Error(`Milestone ${id} not found`)
    }
  }
}

export const milestoneService = new MilestoneService()
