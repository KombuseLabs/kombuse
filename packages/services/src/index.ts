// Business logic services for REST and MCP handlers

export { TicketService, ticketService } from './ticket-service'
export type { ITicketService } from './ticket-service'

export { CommentService, commentService } from './comment-service'
export type { ICommentService } from './comment-service'

export { EventService, eventService } from './event-service'
export type { IEventService } from './event-service'

export { LabelService, labelService } from './label-service'
export type { ILabelService } from './label-service'

export { ProfileService, profileService } from './profile-service'
export type { IProfileService } from './profile-service'

export { ProjectService, projectService } from './project-service'
export type { IProjectService } from './project-service'

export { AgentService, agentService } from './agent-service'
export type {
  IAgentService,
  PermissionContext,
  PermissionCheckRequest,
  PermissionCheckResult,
  TriggerMatchResult,
  AgentRunResult,
  AgentRunner,
} from './agent-service'
