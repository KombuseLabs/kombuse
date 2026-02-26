import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { CommentFilters, CreateCommentInput, UpdateCommentInput } from '@kombuse/types'
import { commentsApi } from '../lib/api'
import { commentKeys, ticketTimelineKeys } from '../lib/query-keys'

export function useComment(id: number) {
  return useQuery({
    queryKey: commentKeys.detail(id),
    queryFn: () => commentsApi.get(id),
    enabled: id > 0,
  })
}

export function useComments(projectId: string, ticketNumber: number, filters?: CommentFilters) {
  return useQuery({
    queryKey: commentKeys.list(projectId, ticketNumber, filters),
    queryFn: () => commentsApi.list(projectId, ticketNumber, filters),
    enabled: !!projectId && ticketNumber > 0,
  })
}

export function useCreateComment(projectId: string, ticketNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Omit<CreateCommentInput, 'ticket_id'>) =>
      commentsApi.create(projectId, ticketNumber, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(projectId, ticketNumber) })
      queryClient.invalidateQueries({ queryKey: ticketTimelineKeys.detail(projectId, ticketNumber) })
    },
  })
}

export function useUpdateComment(projectId: string, ticketNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateCommentInput }) =>
      commentsApi.update(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(projectId, ticketNumber) })
      queryClient.invalidateQueries({ queryKey: ticketTimelineKeys.detail(projectId, ticketNumber) })
    },
  })
}

export function useDeleteComment(projectId: string, ticketNumber: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => commentsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commentKeys.list(projectId, ticketNumber) })
      queryClient.invalidateQueries({ queryKey: ticketTimelineKeys.detail(projectId, ticketNumber) })
    },
  })
}
