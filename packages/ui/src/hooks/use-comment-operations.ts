'use client'

import { useCallback } from 'react'
import type { CommentFilters } from '@kombuse/types'
import { useAppContext } from './use-app-context'
import {
  useComments,
  useCreateComment,
  useUpdateComment,
  useDeleteComment,
} from './use-comments'

/**
 * Hook for comment operations on the current ticket.
 * Automatically uses currentTicket from AppContext.
 */
export function useCommentOperations(filters?: CommentFilters) {
  const { currentTicket } = useAppContext()
  const ticketId = currentTicket?.id ?? 0

  // Query
  const { data: comments, isLoading } = useComments(ticketId, filters)

  // Mutations
  const createMutation = useCreateComment(ticketId)
  const updateMutation = useUpdateComment(ticketId)
  const deleteMutation = useDeleteComment(ticketId)

  // Wrapped operations
  const createComment = useCallback(
    (body: string, authorId: string, parentId?: number, kombuseSessionId?: string) => {
      return createMutation.mutateAsync({
        body,
        author_id: authorId,
        parent_id: parentId,
        kombuse_session_id: kombuseSessionId,
      })
    },
    [createMutation]
  )

  const updateComment = useCallback(
    (id: number, body: string) => {
      return updateMutation.mutateAsync({ id, input: { body } })
    },
    [updateMutation]
  )

  const deleteComment = useCallback(
    (id: number) => {
      return deleteMutation.mutateAsync(id)
    },
    [deleteMutation]
  )

  return {
    // Data
    comments: comments ?? [],

    // Operations
    createComment,
    updateComment,
    deleteComment,

    // Loading states
    isLoading,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}
