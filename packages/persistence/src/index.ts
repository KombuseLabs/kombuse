// @kombuse/persistence
export {
  getDatabase,
  setDatabase,
  initializeDatabase,
  closeDatabase,
  runMigrations,
  seedDatabase,
} from './database'
export type { DatabaseType } from './database'
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
export { ticketsRepository } from './tickets'
export { ticketViewsRepository } from './ticket-views'
export { profilesRepository } from './profiles'
export { profileSettingsRepository } from './profile-settings'
export { projectsRepository } from './projects'
export { eventsRepository, onEventCreated } from './events'
export { eventSubscriptionsRepository } from './event-subscriptions'
export { labelsRepository } from './labels'
export { milestonesRepository } from './milestones'
export { mentionsRepository } from './mentions'
export { commentsRepository } from './comments'
export {
  agentsRepository,
  agentTriggersRepository,
  agentInvocationsRepository,
} from './agents'
export { sessionsRepository } from './sessions'
export { sessionEventsRepository } from './session-events'
export { attachmentsRepository } from './attachments'
