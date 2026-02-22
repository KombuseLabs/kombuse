import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Attachment } from '@kombuse/types'
import { attachmentsApi } from '../lib/api'
import { useMemo } from 'react'

export function useCommentAttachments(commentId: number) {
  return useQuery({
    queryKey: ['comment-attachments', commentId],
    queryFn: () => attachmentsApi.listByComment(commentId),
    enabled: commentId > 0,
  })
}

export function useCommentsAttachments(commentIds: number[]) {
  const stableIds = useMemo(() => [...commentIds].sort(), [commentIds.join(',')])

  const queries = useQueries({
    queries: stableIds.map((id) => ({
      queryKey: ['comment-attachments', id],
      queryFn: () => attachmentsApi.listByComment(id),
      enabled: id > 0,
    })),
  })

  return useMemo(() => {
    const map: Record<number, Attachment[]> = {}
    stableIds.forEach((id, index) => {
      const data = queries[index]?.data
      if (data && data.length > 0) {
        map[id] = data
      }
    })
    return map
  }, [stableIds, queries])
}

export function useUploadAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, file, uploadedById }: {
      commentId: number
      file: File
      uploadedById: string
    }) => attachmentsApi.uploadToComment(commentId, file, uploadedById),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comment-attachments', variables.commentId] })
    },
  })
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: number; commentId: number }) => attachmentsApi.delete(id),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comment-attachments', variables.commentId] })
    },
  })
}

export function useTicketAttachments(projectId: string, ticketNumber: number) {
  return useQuery({
    queryKey: ['ticket-attachments', projectId, ticketNumber],
    queryFn: () => attachmentsApi.listByTicket(projectId, ticketNumber),
    enabled: !!projectId && ticketNumber > 0,
  })
}

export function useUploadTicketAttachment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ projectId, ticketNumber, file, uploadedById }: {
      projectId: string
      ticketNumber: number
      file: File
      uploadedById: string
    }) => attachmentsApi.uploadToTicket(projectId, ticketNumber, file, uploadedById),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ticket-attachments', variables.projectId, variables.ticketNumber] })
    },
  })
}
