// Business logic services for REST and MCP handlers

export { TicketService, ticketService } from './ticket-service'

export { CommentService, commentService } from './comment-service'

export { EventService, eventService } from './event-service'

export { LabelService, labelService } from './label-service'

export { MilestoneService, milestoneService } from './milestone-service'

export { ProfileService, profileService } from './profile-service'

export { ProjectService, projectService } from './project-service'

export { AgentService, agentService } from './agent-service'
export type { TriggerMatchResult } from './agent-service'

export { PluginExportService, pluginExportService, PackageExistsError } from './plugin-export-service'

export { PluginPublishService, pluginPublishService, PluginPublishError } from './plugin-publish-service'

export { PluginImportService, pluginImportService, PluginAlreadyInstalledError, InvalidManifestError } from './plugin-import-service'

export { PluginLifecycleService, pluginLifecycleService, PluginNotFoundError } from './plugin-lifecycle-service'

export { buildPluginPackageManager, resolvePluginConfig } from './plugin-feed-builder'

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
export type { UploadParams } from './attachment-service'

export { FileStorage, fileStorage, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './file-storage-service'

export { ClaudeCodeScanner, claudeCodeScanner } from './claude-code-scanner-service'
export type { SessionEntry } from './claude-code-scanner-service'

export { SessionStateMachine } from './session-state-machine-service'
export type {
  SessionTransitionEvent,
  TransitionContext,
  StateMachineDeps,
} from './session-state-machine-service'

// Template rendering
export {
  renderTemplate,
  renderTemplateWithIncludes,
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
  MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
  NOTIFICATIONS_SCOPE_TO_PROJECT_SETTING_KEY,
  MAX_CHAIN_DEPTH,
  getBackendCapability,
  resolveConfiguredBackendType,
  normalizeModelPreference,
  resolveBackendType,
  resolveModelPreference,
  readUserDefaultBackendType,
  readUserDefaultModelPreference,
  readUserDefaultMaxChainDepth,
  readUserBackendIdleTimeoutMinutes,
  readMcpAnonymousWriteAccess,
  readNotificationScope,
} from './session-preferences-service'
export type {
  ResolveBackendTypeInput,
  ResolveModelPreferenceInput,
  ResolvedModelPreference,
  NotificationScope,
} from './session-preferences-service'

// Project initialization
export { initProject } from './project-init-service'

// Model catalog
export { getModelCatalog, getModelCatalogDynamic, CODEX_FALLBACK_MODELS, CLAUDE_CODE_MODELS } from './model-catalog-service'

// Agent type presets
export { getTypePreset, getEffectivePreset, presetToAllowedTools, shouldAutoApprove, getAvailableAgentTypes, stripCdPrefix } from './agent-type-preset-service'
export type { AgentTypePreset } from './agent-type-preset-service'

// File-based permissions
export { mergeFilePermissions, appendToProjectPermissions, getProjectPermissionsPath } from './permission-file-service'

export { AnalyticsService, analyticsService } from './analytics-service'
