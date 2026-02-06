import { useQuery } from '@tanstack/react-query'
import { timelineApi } from '../lib/api'

export function useTicketTimeline(ticketId: number) {
  return useQuery({
    queryKey: ['ticket-timeline', ticketId],
    queryFn: () => timelineApi.getTicketTimeline(ticketId),
    enabled: ticketId > 0,
  })
}
