import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CommentFilters, CreateCommentInput, UpdateCommentInput } from '@kombuse/types'
import { commentsApi } from '../lib/api'

export function useComments(ticketId: number, filters?: CommentFilters) {
  return useQuery({
    queryKey: ['comments', ticketId, filters],
    queryFn: () => commentsApi.list(ticketId, filters),
    enabled: ticketId > 0,
  })
}

export function useCreateComment(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreateCommentInput, 'ticket_id'>) =>
      commentsApi.create(ticketId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] })
    },
  })
}

export function useUpdateComment(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateCommentInput }) =>
      commentsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] })
    },
  })
}

export function useDeleteComment(ticketId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => commentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', ticketId] })
      queryClient.invalidateQueries({ queryKey: ['ticket-timeline', ticketId] })
    },
  })
}
