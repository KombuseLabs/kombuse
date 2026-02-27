import type {
  Label,
  LabelFilters,
  CreateLabelInput,
  UpdateLabelInput,
} from '@kombuse/types'
import { labelsRepository } from '@kombuse/persistence'

export class LabelService {
  list(filters?: LabelFilters): Label[] {
    return labelsRepository.list(filters)
  }

  get(id: number): Label | null {
    return labelsRepository.get(id)
  }

  create(input: CreateLabelInput): Label {
    return labelsRepository.create(input)
  }

  update(id: number, input: UpdateLabelInput): Label {
    const existing = labelsRepository.get(id)
    if (!existing) {
      throw new Error(`Label ${id} not found`)
    }

    const updated = labelsRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update label ${id}`)
    }

    return updated
  }

  delete(id: number): void {
    const success = labelsRepository.delete(id)
    if (!success) {
      throw new Error(`Label ${id} not found`)
    }
  }

  addToTicket(projectId: string, ticketNumber: number, labelId: number, addedById?: string): void {
    labelsRepository.addToTicketByNumber(projectId, ticketNumber, labelId, addedById)
  }

  removeFromTicket(projectId: string, ticketNumber: number, labelId: number, removedById?: string): void {
    const success = labelsRepository.removeFromTicketByNumber(projectId, ticketNumber, labelId, removedById)
    if (!success) {
      throw new Error(`Label ${labelId} not attached to ticket`)
    }
  }

  getTicketLabels(projectId: string, ticketNumber: number): Label[] {
    return labelsRepository.getTicketLabelsByNumber(projectId, ticketNumber)
  }
}

// Singleton instance for convenience
export const labelService = new LabelService()
