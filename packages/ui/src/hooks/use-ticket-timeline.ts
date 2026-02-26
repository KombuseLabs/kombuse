import { useQuery } from '@tanstack/react-query'
import { timelineApi } from '../lib/api'
import { ticketTimelineKeys } from '../lib/query-keys'

export function useTicketTimeline(projectId: string, ticketNumber: number) {
  return useQuery({
    queryKey: ticketTimelineKeys.detail(projectId, ticketNumber),
    queryFn: () => timelineApi.getTicketTimeline(projectId, ticketNumber),
    enabled: !!projectId && ticketNumber > 0,
  })
}
