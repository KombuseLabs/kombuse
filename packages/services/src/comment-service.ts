import type {
  CommentWithAuthor,
  CommentFilters,
  CreateCommentInput,
  UpdateCommentInput,
  Mention,
} from '@kombuse/types'
import { commentsRepository, mentionsRepository, resolveTicketId } from '@kombuse/persistence'

/**
 * Service interface for comment operations
 */
export interface ICommentService {
  list(filters?: CommentFilters): CommentWithAuthor[]
  get(id: number): CommentWithAuthor | null
  getByTicket(projectId: string, ticketNumber: number): CommentWithAuthor[]
  create(input: CreateCommentInput): CommentWithAuthor
  update(id: number, input: UpdateCommentInput): CommentWithAuthor
  delete(id: number): void
  getReplyCount(id: number): number
  getMentions(commentId: number): Mention[]
}

/**
 * Comment service implementation with business logic
 */
export class CommentService implements ICommentService {
  list(filters?: CommentFilters): CommentWithAuthor[] {
    return commentsRepository.list(filters)
  }

  get(id: number): CommentWithAuthor | null {
    return commentsRepository.get(id)
  }

  getByTicket(projectId: string, ticketNumber: number): CommentWithAuthor[] {
    const ticketId = resolveTicketId(projectId, ticketNumber)
    return commentsRepository.getByTicket(ticketId)
  }

  create(input: CreateCommentInput): CommentWithAuthor {
    return commentsRepository.create(input)
  }

  update(id: number, input: UpdateCommentInput): CommentWithAuthor {
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
