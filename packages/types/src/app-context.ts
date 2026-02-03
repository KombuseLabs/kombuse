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
}

/**
 * Combined AppContext value provided by AppProvider
 */
export type AppContextValue = AppState & AppActions
