import { useQuery } from '@tanstack/react-query'
import { timelineApi } from '../lib/api'

export function useTicketTimeline(projectId: string, ticketNumber: number) {
  return useQuery({
    queryKey: ['ticket-timeline', projectId, ticketNumber],
    queryFn: () => timelineApi.getTicketTimeline(projectId, ticketNumber),
    enabled: !!projectId && ticketNumber > 0,
  })
}
