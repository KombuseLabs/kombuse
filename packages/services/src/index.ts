// Business logic services for REST and MCP handlers

export { TicketService, ticketService } from './ticket-service'
export type { ITicketService } from './ticket-service'

export { CommentService, commentService } from './comment-service'
export type { ICommentService } from './comment-service'

export { EventService, eventService } from './event-service'
export type { IEventService } from './event-service'

export { LabelService, labelService } from './label-service'
export type { ILabelService } from './label-service'

export { MilestoneService, milestoneService } from './milestone-service'
export type { IMilestoneService } from './milestone-service'

export { ProfileService, profileService } from './profile-service'
export type { IProfileService } from './profile-service'

export { ProjectService, projectService } from './project-service'
export type { IProjectService } from './project-service'

export { AgentService, agentService } from './agent-service'
export type { IAgentService, TriggerMatchResult } from './agent-service'
export type {
  PermissionContext,
  PermissionCheckRequest,
  PermissionCheckResult,
} from '@kombuse/types'

export {
  SessionPersistenceService,
  sessionPersistenceService,
  buildConversationSummary,
} from './session-persistence-service'
export type {
  ISessionPersistenceService,
  SessionPersistenceOptions,
} from './session-persistence-service'

export { AttachmentService, attachmentService } from './attachment-service'
export type { IAttachmentService, UploadParams } from './attachment-service'

export { FileStorage, fileStorage, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './file-storage'
export type { IFileStorage } from './file-storage'

export { ClaudeCodeScanner, claudeCodeScanner } from './claude-code-scanner'
export type { IClaudeCodeScanner, SessionEntry } from './claude-code-scanner'

export { SessionStateMachine } from './session-state-machine'
export type {
  SessionTransitionEvent,
  TransitionContext,
  StateMachineDeps,
} from './session-state-machine'

// Template rendering
export {
  renderTemplate,
  hasTemplateVariables,
  buildTemplateContext,
} from './template'

// Session preferences
export {
  DEFAULT_PREFERENCE_PROFILE_ID,
  CHAT_DEFAULT_BACKEND_SETTING_KEY,
  CHAT_DEFAULT_MODEL_SETTING_KEY,
  AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
  CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
  getBackendCapability,
  resolveConfiguredBackendType,
  normalizeModelPreference,
  resolveBackendType,
  resolveModelPreference,
  readUserDefaultBackendType,
  readUserDefaultModelPreference,
  readUserDefaultMaxChainDepth,
  readUserBackendIdleTimeoutMinutes,
} from './session-preferences-service'
export type {
  ResolveBackendTypeInput,
  ResolveModelPreferenceInput,
  ResolvedModelPreference,
} from './session-preferences-service'

// Model catalog
export { getModelCatalog, getModelCatalogDynamic, CODEX_FALLBACK_MODELS, CLAUDE_CODE_MODELS } from './model-catalog-service'
