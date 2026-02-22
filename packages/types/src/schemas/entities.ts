import { z } from 'zod'
import { backendTypeSchema } from './agents'

export const backendStatusSchema = z.object({
  backendType: backendTypeSchema,
  available: z.boolean(),
  version: z.string().nullable(),
  path: z.string().nullable(),
})

export const timestampSchema = z.string().min(1)
export const nullableTimestampSchema = timestampSchema.nullable()

export const profileTypeSchema = z.enum(['user', 'agent'])

export const profileSchema = z.object({
  id: z.string().min(1),
  type: profileTypeSchema,
  name: z.string().min(1),
  slug: z.string().nullable(),
  email: z.string().nullable(),
  description: z.string().nullable(),
  avatar_url: z.string().nullable(),
  external_source: z.string().nullable(),
  external_id: z.string().nullable(),
  plugin_id: z.string().nullable(),
  is_active: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const projectRepoSourceSchema = z.enum(['github', 'gitlab', 'bitbucket'])

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  owner_id: z.string().min(1),
  local_path: z.string().nullable(),
  repo_source: projectRepoSourceSchema.nullable(),
  repo_owner: z.string().nullable(),
  repo_name: z.string().nullable(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const labelSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().nullable(),
  color: z.string().min(1),
  description: z.string().nullable(),
  plugin_id: z.string().nullable().optional(),
  is_enabled: z.union([z.boolean(), z.number().transform((v) => v === 1)]),
  usage_count: z.number().int().nonnegative().optional(),
  created_at: timestampSchema,
})

export const milestoneStatusSchema = z.enum(['open', 'closed'])

export const milestoneSchema = z.object({
  id: z.number().int().positive(),
  project_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  due_date: z.string().nullable(),
  status: milestoneStatusSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const milestoneWithStatsSchema = milestoneSchema.extend({
  open_count: z.number().int().nonnegative(),
  closed_count: z.number().int().nonnegative(),
  total_count: z.number().int().nonnegative(),
})

export const ticketStatusSchema = z.enum(['open', 'closed', 'in_progress', 'blocked'])
export const ticketPrioritySchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])

export const ticketSchema = z.object({
  id: z.number().int().positive(),
  ticket_number: z.number().int().positive(),
  project_id: z.string().min(1),
  author_id: z.string().min(1),
  assignee_id: z.string().nullable(),
  claimed_by_id: z.string().nullable(),
  title: z.string().min(1),
  body: z.string().nullable(),
  triggers_enabled: z.boolean(),
  loop_protection_enabled: z.boolean(),
  status: ticketStatusSchema,
  priority: ticketPrioritySchema.nullable(),
  external_source: z.string().nullable(),
  external_id: z.string().nullable(),
  milestone_id: z.number().int().positive().nullable(),
  external_url: z.string().nullable(),
  synced_at: nullableTimestampSchema,
  claimed_at: nullableTimestampSchema,
  claim_expires_at: nullableTimestampSchema,
  created_at: timestampSchema,
  updated_at: timestampSchema,
  opened_at: timestampSchema,
  closed_at: nullableTimestampSchema,
  last_activity_at: timestampSchema,
})

export const ticketWithRelationsSchema = ticketSchema.extend({
  author: profileSchema,
  assignee: profileSchema.nullable(),
  labels: z.array(labelSchema),
  has_unread: z.number().int().optional(),
  match_context: z.string().nullable().optional(),
  match_source: z.enum(['title', 'body', 'comment']).nullable().optional(),
})

export const ticketWithLabelsSchema = ticketSchema.extend({
  labels: z.array(labelSchema),
  has_unread: z.number().int().optional(),
  match_context: z.string().nullable().optional(),
  match_source: z.enum(['title', 'body', 'comment']).nullable().optional(),
})

export const ticketStatusCountsSchema = z.object({
  open: z.number().int().nonnegative(),
  in_progress: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  closed: z.number().int().nonnegative(),
})

export const ticketViewSchema = z.object({
  id: z.number().int().positive(),
  ticket_id: z.number().int().positive(),
  profile_id: z.string().min(1),
  last_viewed_at: timestampSchema,
})

export const attachmentMetaSchema = z.object({
  id: z.number().int().positive(),
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
})

export const attachmentSchema = z.object({
  id: z.number().int().positive(),
  comment_id: z.number().int().positive().nullable(),
  ticket_id: z.number().int().positive().nullable(),
  filename: z.string().min(1),
  mime_type: z.string().min(1),
  size_bytes: z.number().int().nonnegative(),
  storage_path: z.string().min(1),
  uploaded_by_id: z.string().min(1),
  created_at: timestampSchema,
})

export const commentSchema = z.object({
  id: z.number().int().positive(),
  ticket_id: z.number().int().positive(),
  author_id: z.string().min(1),
  parent_id: z.number().int().positive().nullable(),
  kombuse_session_id: z.string().nullable(),
  body: z.string(),
  external_source: z.string().nullable(),
  external_id: z.string().nullable(),
  synced_at: nullableTimestampSchema,
  is_edited: z.boolean(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const commentWithAuthorSchema = commentSchema.extend({
  author: profileSchema,
})

export const commentWithAuthorAndAttachmentsSchema = commentWithAuthorSchema.extend({
  attachments: z.array(attachmentMetaSchema),
})

export const actorTypeSchema = z.enum(['user', 'agent', 'system'])

export const eventSchema = z.object({
  id: z.number().int().positive(),
  event_type: z.string().min(1),
  project_id: z.string().nullable(),
  ticket_id: z.number().int().positive().nullable(),
  comment_id: z.number().int().positive().nullable(),
  actor_id: z.string().nullable(),
  actor_type: actorTypeSchema,
  kombuse_session_id: z.string().nullable(),
  payload: z.string(),
  created_at: timestampSchema,
})

export const eventWithActorSchema = eventSchema.extend({
  actor: profileSchema.nullable(),
})

export const eventWithPayloadSchema = eventSchema.extend({
  payload: z.unknown(),
})

export const eventSubscriptionSchema = z.object({
  id: z.number().int().positive(),
  subscriber_id: z.string().min(1),
  event_type: z.string().min(1),
  project_id: z.string().nullable(),
  last_processed_event_id: z.number().int().positive().nullable(),
  created_at: timestampSchema,
})

export const sessionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'aborted',
  'stopped',
])

export const sessionMetadataSchema = z.record(z.string(), z.unknown())

export const sessionSchema = z.object({
  id: z.string().min(1),
  kombuse_session_id: z.string().nullable(),
  backend_type: backendTypeSchema.nullable(),
  backend_session_id: z.string().nullable(),
  ticket_id: z.number().int().positive().nullable(),
  project_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  status: sessionStatusSchema,
  metadata: sessionMetadataSchema,
  started_at: timestampSchema,
  completed_at: nullableTimestampSchema,
  failed_at: nullableTimestampSchema,
  aborted_at: nullableTimestampSchema,
  last_event_seq: z.number().int().nonnegative(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
  agent_name: z.string().nullable().optional(),
  prompt_preview: z.string().nullable().optional(),
  effective_backend: backendTypeSchema.nullable().optional(),
  model_preference: z.string().nullable().optional(),
  applied_model: z.string().nullable().optional(),
})

export const publicSessionSchema = sessionSchema.omit({ id: true })

export const sessionEventSchema = z.object({
  id: z.number().int().positive(),
  session_id: z.string().min(1),
  seq: z.number().int().nonnegative(),
  event_type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
  created_at: timestampSchema,
})

export const permissionLogEntrySchema = z.object({
  id: z.number().int().positive(),
  session_id: z.string().min(1),
  kombuse_session_id: z.string().nullable(),
  ticket_id: z.number().int().positive().nullable(),
  ticket_title: z.string().nullable(),
  requested_at: timestampSchema,
  request_id: z.string().min(1),
  tool_name: z.string().min(1),
  description: z.string().nullable(),
  input: z.record(z.string(), z.unknown()),
  auto_approved: z.boolean(),
  behavior: z.enum(['allow', 'deny']).nullable(),
  deny_message: z.string().nullable(),
  resolved_at: nullableTimestampSchema,
})

export const profileSettingSchema = z.object({
  id: z.number().int().positive(),
  profile_id: z.string().min(1),
  setting_key: z.string().min(1),
  setting_value: z.string(),
  created_at: timestampSchema,
  updated_at: timestampSchema,
})

export const databaseObjectTypeSchema = z.enum(['table', 'view'])

export const databaseTableInfoSchema = z.object({
  name: z.string().min(1),
  type: databaseObjectTypeSchema,
})

export type ProfileEntity = z.infer<typeof profileSchema>
export type ProjectEntity = z.infer<typeof projectSchema>
export type LabelEntity = z.infer<typeof labelSchema>
export type MilestoneEntity = z.infer<typeof milestoneSchema>
export type TicketEntity = z.infer<typeof ticketSchema>
export type TicketWithRelationsEntity = z.infer<typeof ticketWithRelationsSchema>
export type TicketWithLabelsEntity = z.infer<typeof ticketWithLabelsSchema>
export type TicketViewEntity = z.infer<typeof ticketViewSchema>
export type CommentEntity = z.infer<typeof commentSchema>
export type CommentWithAuthorEntity = z.infer<typeof commentWithAuthorSchema>
export type AttachmentEntity = z.infer<typeof attachmentSchema>
export type AttachmentMetaEntity = z.infer<typeof attachmentMetaSchema>
export type EventEntity = z.infer<typeof eventSchema>
export type EventWithActorEntity = z.infer<typeof eventWithActorSchema>
export type EventSubscriptionEntity = z.infer<typeof eventSubscriptionSchema>
export type SessionEntity = z.infer<typeof sessionSchema>
export type PublicSessionEntity = z.infer<typeof publicSessionSchema>
export type SessionEventEntity = z.infer<typeof sessionEventSchema>
export type PermissionLogEntryEntity = z.infer<typeof permissionLogEntrySchema>
export type ProfileSettingEntity = z.infer<typeof profileSettingSchema>
