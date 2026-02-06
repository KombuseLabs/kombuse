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
  sessionId: string
  requestId: string
  toolName: string
  input: Record<string, unknown>
  /** Human-readable description of what this permission request will do */
  description?: string
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
  /** Map of requestId -> pending permission details */
  pendingPermissions: Map<string, PendingPermission>
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
  removePendingPermission: (requestId: string) => void
  clearPendingPermissionsForSession: (sessionId: string) => void
}

/**
 * Combined AppContext value provided by AppProvider
 */
export type AppContextValue = AppState & AppActions
