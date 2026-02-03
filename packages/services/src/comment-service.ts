import type {
  Comment,
  CommentFilters,
  CreateCommentInput,
  UpdateCommentInput,
  Mention,
} from '@kombuse/types'
import { commentsRepository, mentionsRepository } from '@kombuse/persistence'

/**
 * Service interface for comment operations
 */
export interface ICommentService {
  list(filters?: CommentFilters): Comment[]
  get(id: number): Comment | null
  getByTicket(ticketId: number): Comment[]
  create(input: CreateCommentInput): Comment
  update(id: number, input: UpdateCommentInput): Comment
  delete(id: number): void
  getReplyCount(id: number): number
  getMentions(commentId: number): Mention[]
}

/**
 * Comment service implementation with business logic
 */
export class CommentService implements ICommentService {
  list(filters?: CommentFilters): Comment[] {
    return commentsRepository.list(filters)
  }

  get(id: number): Comment | null {
    return commentsRepository.get(id)
  }

  getByTicket(ticketId: number): Comment[] {
    return commentsRepository.getByTicket(ticketId)
  }

  create(input: CreateCommentInput): Comment {
    return commentsRepository.create(input)
  }

  update(id: number, input: UpdateCommentInput): Comment {
    const existing = commentsRepository.get(id)
    if (!existing) {
      throw new Error(`Comment ${id} not found`)
    }

    const updated = commentsRepository.update(id, input)
    if (!updated) {
      throw new Error(`Failed to update comment ${id}`)
    }

    return updated
  }

  delete(id: number): void {
    const existing = commentsRepository.get(id)
    if (!existing) {
      throw new Error(`Comment ${id} not found`)
    }

    const success = commentsRepository.delete(id)
    if (!success) {
      throw new Error(`Failed to delete comment ${id}`)
    }
  }

  getReplyCount(id: number): number {
    return commentsRepository.getReplyCount(id)
  }

  getMentions(commentId: number): Mention[] {
    return mentionsRepository.getByComment(commentId)
  }
}

// Singleton instance for convenience
export const commentService = new CommentService()
