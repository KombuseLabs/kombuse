// @kombuse/persistence
export {
  getDatabase,
  setDatabase,
  initializeDatabase,
  closeDatabase,
  runMigrations,
  seedDatabase,
  dbContext,
} from './database'
export type { DatabaseType } from './database'
export { loadKombuseConfig, loadProjectConfig, saveProjectConfig, getKombuseDir, resolveDbPath, resolveEnvToken } from './config.repository'
export {
  DEFAULT_QUERY_LIMIT,
  MAX_QUERY_LIMIT,
  ensureLimit,
  queryDatabaseReadOnly,
  listDatabaseTables,
  describeDatabaseTable,
} from './database-query'
export type {
  DatabaseQueryParam,
  DatabaseRow,
  DatabaseQueryResult,
  DatabaseTableInfo,
  DatabaseTableDescription,
} from './database-query'

// Well-known profile IDs
export { ANONYMOUS_AGENT_ID } from '@kombuse/types'

// Repositories
export { ticketsRepository, resolveTicketId } from './tickets.repository'
export { ticketViewsRepository } from './ticket-views.repository'
export { profilesRepository } from './profiles.repository'
export { profileSettingsRepository } from './profile-settings.repository'
export { projectsRepository } from './projects.repository'
export { eventsRepository, onEventCreated } from './events.repository'
export { eventSubscriptionsRepository } from './event-subscriptions.repository'
export { labelsRepository } from './labels.repository'
export { milestonesRepository } from './milestones.repository'
export { mentionsRepository } from './mentions.repository'
export { commentsRepository } from './comments.repository'
export {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
} from './agents.repository'
export { pluginsRepository } from './plugins.repository'
export { pluginFilesRepository } from './plugin-files.repository'
export { sessionsRepository } from './sessions.repository'
export { analyticsRepository } from './analytics.repository'
export { sessionEventsRepository } from './session-events.repository'
export { attachmentsRepository } from './attachments.repository'
