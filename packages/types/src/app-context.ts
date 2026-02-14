import type { Ticket } from './tickets'

/**
 * View identifiers for the application
 */
export type AppView = 'home' | 'tickets' | 'chats' | 'agents' | 'settings' | null

/**
 * Session reference for chat/agent sessions
 */
export interface AppSession {
  id: string
}

/**
 * A pending permission request from an agent
 */
export interface PendingPermission {
  permissionKey: string
  sessionId: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
  /** Human-readable description of what this permission request will do */
  description?: string
  /** Ticket ID if this permission is for a ticket-triggered session */
  ticketId?: number
}

/**
 * Status indicator for agent activity
 */
export type AgentActivityStatus = 'idle' | 'running' | 'pending' | 'error'

/**
 * Agent activity status for a ticket
 */
export interface TicketAgentStatus {
  status: AgentActivityStatus
  sessionCount: number
}

/**
 * Info about a currently active agent session, for the Active Agents Indicator.
 */
export interface ActiveSessionInfo {
  kombuseSessionId: string
  agentName: string
  ticketId?: number
  ticketTitle?: string
  startedAt: string
}

/**
 * Application state managed by AppProvider
 */
export interface AppState {
  /** Currently selected/viewed ticket */
  currentTicket: Ticket | null
  /** Current project context */
  currentProjectId: string | null
  /** Current view/route */
  view: AppView
  /** Whether an AI generation is in progress */
  isGenerating: boolean
  /** Current chat/agent session */
  currentSession: AppSession | null
  /** Map of permissionKey -> pending permission details */
  pendingPermissions: Map<string, PendingPermission>
  /** Map of ticketId -> agent activity status */
  ticketAgentStatus: Map<number, TicketAgentStatus>
  /** Map of kombuseSessionId -> active session info */
  activeSessions: Map<string, ActiveSessionInfo>
}

/**
 * Actions to update application state
 */
export interface AppActions {
  setCurrentTicket: (ticket: Ticket | null) => void
  setCurrentProjectId: (projectId: string | null) => void
  setView: (view: AppView) => void
  setIsGenerating: (isGenerating: boolean) => void
  setCurrentSession: (session: AppSession | null) => void
  addPendingPermission: (permission: PendingPermission) => void
  removePendingPermission: (permissionKey: string) => void
  clearPendingPermissionsForSession: (sessionId: string) => void
  /** Update agent activity status for a ticket */
  updateTicketAgentStatus: (ticketId: number, status: TicketAgentStatus) => void
  /** Get agent activity status for a ticket */
  getTicketAgentStatus: (ticketId: number) => TicketAgentStatus | undefined
  /** Add an active agent session */
  addActiveSession: (session: ActiveSessionInfo) => void
  /** Remove an active agent session */
  removeActiveSession: (kombuseSessionId: string) => void
}

/**
 * Combined AppContext value provided by AppProvider
 */
export type AppContextValue = AppState & AppActions
