// Shared types between services and UI

export type {
  AppView,
  AppSession,
  PendingPermission,
  AgentActivityStatus,
  TicketAgentStatus,
  ActiveSessionInfo,
  AppState,
  AppActions,
  AppContextValue,
} from './app-context.types'
export type {
  CommandContext,
  Command,
  CommandRegistry,
} from './commands.types'
export {
  ANONYMOUS_AGENT_ID,
  type ProfileType,
  type Profile,
  type CreateProfileInput,
  type UpdateProfileInput,
  type ProfileFilters,
} from './profiles.types'
export type {
  ProfileSetting,
  UpsertProfileSettingInput,
  ProfileSettingFilters,
} from './profile-settings.types'
export type {
  RepoSource,
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilters,
} from './projects.types'
export type {
  Label,
  LabelSortBy,
  LabelUsageScope,
  CreateLabelInput,
  UpdateLabelInput,
  LabelFilters,
} from './labels.types'
export type {
  MilestoneStatus,
  Milestone,
  MilestoneWithStats,
  CreateMilestoneInput,
  UpdateMilestoneInput,
  MilestoneFilters,
} from './milestones.types'
export type {
  TicketStatus,
  TicketPriority,
  Ticket,
  TicketWithRelations,
  TicketWithLabels,
  TicketFilters,
  CreateTicketInput,
  UpdateTicketInput,
  TicketLabelInput,
  ClaimTicketInput,
  ClaimResult,
  TicketStatusCounts,
} from './tickets.types'
export type {
  TicketView,
  UpsertTicketViewInput,
} from './ticket-views.types'
export type {
  Comment,
  CommentWithAuthor,
  CommentWithAuthorAndAttachments,
  CreateCommentInput,
  UpdateCommentInput,
  CommentFilters,
} from './comments.types'
export type {
  MentionType,
  ProfileMention,
  TicketMention,
  Mention,
  MentionWithProfile,
  CreateMentionInput,
  MentionFilters,
} from './mentions.types'
export type {
  AttachmentMeta,
  Attachment,
  CreateAttachmentInput,
  AttachmentFilters,
} from './attachments.types'
export {
  EVENT_TYPES,
  type ActorType,
  type Event,
  type EventWithActor,
  type EventWithPayload,
  type CreateEventInput,
  type EventFilters,
  type EventType,
  type EventSubscription,
  type EventSubscriptionInput,
  type UnprocessedEventsResult,
} from './events.types'
export type {
  DatabaseObjectType,
  DatabaseQueryParam,
  DatabaseRow,
  DatabaseTableInfo,
  DatabaseTablesResponse,
  DatabaseQueryInput,
  DatabaseQueryResponse,
} from './database.types'
export type {
  TimelineItemType,
  TimelineItem,
  TicketTimeline,
} from './timeline.types'
export type {
  ResourcePermission,
  ToolPermission,
  Permission,
  ResolvedPreset,
  AnthropicConfig,
  OpenAIConfig,
  AgentConfig,
  PluginBase,
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  AgentFilters,
  AllowedInvoker,
  AgentTrigger,
  CreateAgentTriggerInput,
  UpdateAgentTriggerInput,
  InvocationStatus,
  AgentInvocation,
  CreateAgentInvocationInput,
  UpdateAgentInvocationInput,
  AgentInvocationFilters,
} from './agents.types'
export {
  SELF_PLACEHOLDER,
  type AgentExportFrontmatter,
  type ExportedTrigger,
  type AgentExportFile,
  type AgentExportResult,
  type AgentExportInput,
} from './agent-export.types'
export type {
  ExportedLabel,
  KombusePluginManifest,
  PluginExportInput,
  PluginExportResult,
  PluginPublishInput,
  PluginPublishResult,
} from './plugin-export.types'
export type {
  Plugin,
  CreatePluginInput,
  UpdatePluginInput,
  PluginFilters,
} from './plugin.types'
export type {
  PluginFile,
  CreatePluginFileInput,
  UpdatePluginFileInput,
} from './plugin-files.types'
export type {
  PluginInstallInput,
  PluginInstallResult,
  AvailablePlugin,
  PluginUpdateCheckResult,
  PluginRemoteInstallInput,
} from './plugin-import.types'
export {
  BACKEND_TYPES,
  type PermissionMode,
  type ImageAttachment,
  type StartOptions,
  type PermissionConfig,
  type ConversationContext,
  type BackendType,
  type AgentMessageRole,
  type AgentEventBase,
  type AgentMessageEvent,
  type AgentToolUseEvent,
  type AgentToolResultEvent,
  type AgentPermissionRequestEvent,
  type AgentPermissionResponseEvent,
  type AgentRawEvent,
  type AgentErrorEvent,
  type AgentCompleteReason,
  type AgentCompleteEvent,
  type AgentBackendLifecycleState,
  type AgentLifecycleEvent,
  type AgentEvent,
  type JsonPrimitive,
  type JsonValue,
  type JsonObject,
  type SerializedError,
  type SerializedAgentMessageEvent,
  type SerializedAgentToolUseEvent,
  type SerializedAgentToolResultEvent,
  type SerializedAgentPermissionRequestEvent,
  type SerializedAgentPermissionResponseEvent,
  type SerializedAgentRawEvent,
  type SerializedAgentErrorEvent,
  type SerializedAgentCompleteEvent,
  type SerializedAgentLifecycleEvent,
  type SerializedAgentEvent,
  type PermissionResponseOptions,
  type AgentBackend,
} from './agent.types'
export type {
  AgentInvokeMessage,
  PermissionResponseMessage,
  AgentExecutionEvent,
} from './agent-execution.types'
export type {
  PermissionContext,
  PermissionCheckRequest,
  PermissionCheckResult,
} from './permissions.types'
export {
  createSessionId,
  parseSessionId,
  isValidSessionId,
  type KombuseSessionId,
  type SessionOrigin,
  type ParsedSessionId,
} from './session-id.types'
export type {
  SessionStatus,
  SessionMetadata,
  Session,
  PublicSession,
  CreateSessionInput,
  SessionFilters,
  UpdateSessionInput,
  SessionEvent,
  CreateSessionEventInput,
  SessionEventFilters,
  PermissionLogEntry,
  PermissionLogFilters,
} from './sessions.types'
export type {
  SessionDurationPercentile,
  PipelineStageDuration,
  ToolReadFrequency,
  ToolCallsPerSession,
  ToolDurationPercentile,
  ToolCallVolume,
  BurndownEntry,
  AgentRuntimeSegment,
} from './analytics.types'
export type {
  AgentStreamEvent,
  WebSocketEvent,
  ClientMessage,
  ServerMessage,
  TopicPattern,
} from './websocket.types'
export type {
  UpdateInfo,
  UpdateState,
  UpdateStatus,
  UpdateCheckResult,
  UpdateMessage,
} from './updates.types'
export type {
  TemplateContext,
  TicketEnrichedContext,
  CommentEnrichedContext,
} from './templates.types'
export {
  toSlug,
  SLUG_REGEX,
  UUID_REGEX,
} from './slug.types'
export type {
  ClaudeCodeProject,
  ClaudeCodeProjectWithStatus,
} from './claude-code.types'
export type {
  CodexMcpStatus,
  SetCodexMcpInput,
} from './codex.types'
export type {
  ClaudeCodeMcpStatus,
  SetClaudeCodeMcpInput,
} from './claude-code-mcp.types'
export type {
  ModelOption,
  ModelCatalogResponse,
} from './models.types'
export type {
  BackendStatus,
} from './backend-status.types'
export type {
  PluginSourceConfig,
  KombuseConfig,
} from './config.types'
export type {
  PackageType,
  PkgManifest,
} from './pkg.types'
export type {
  InitProjectOptions,
  InitProjectFileResult,
  InitProjectResult,
  McpBridgeConfig,
} from './project-init.types'
export * as schemas from './schemas'
