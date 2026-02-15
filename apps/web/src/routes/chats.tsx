import { useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AgentPicker, Chat, SessionList } from "@kombuse/ui/components";
import {
  useCreateSession,
  useSessions,
  useSessionByKombuseId,
  useAppContext,
  useDeleteSession,
  useProfileSetting,
} from "@kombuse/ui/hooks";
import { ChatProvider } from "@kombuse/ui/providers";
import { cn } from "@kombuse/ui/lib/utils";
import { BACKEND_TYPES, type BackendType } from "@kombuse/types";

const USER_PROFILE_ID = "user-1";
const CHAT_DEFAULT_BACKEND_SETTING_KEY = "chat.default_backend_type";
const CHAT_DEFAULT_MODEL_SETTING_KEY = "chat.default_model";

export function Chats() {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{
    projectId?: string;
    sessionId?: string;
  }>();
  const isProjectContext = Boolean(projectId);
  const selectedSessionId = sessionId ?? null;
  const isDraft = !selectedSessionId;

  const { data: sessions, isLoading: sessionsLoading } = useSessions({ sort_by: 'updated_at' });
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const { pendingPermissions } = useAppContext();
  const { data: defaultBackendSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_BACKEND_SETTING_KEY);
  const { data: defaultModelSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_MODEL_SETTING_KEY);

  const normalizeBackendType = (value?: string | null): BackendType => {
    if (
      value === BACKEND_TYPES.CLAUDE_CODE
      || value === BACKEND_TYPES.CODEX
      || value === BACKEND_TYPES.MOCK
    ) {
      return value;
    }
    return BACKEND_TYPES.CLAUDE_CODE;
  };

  // Agent picker state (only used for draft/new chats)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedBackendTypeOverride, setSelectedBackendTypeOverride] = useState<BackendType | null>(null);
  const [selectedModelPreferenceOverride, setSelectedModelPreferenceOverride] = useState<string | null>(null);

  const globalDefaultBackendType = normalizeBackendType(defaultBackendSetting?.setting_value);
  const globalDefaultModelPreference = (defaultModelSetting?.setting_value ?? "").trim();
  const draftBackendType = selectedBackendTypeOverride ?? globalDefaultBackendType;
  const draftModelPreference = selectedModelPreferenceOverride ?? globalDefaultModelPreference;

  // Resolve agent_id for existing sessions
  const { data: currentSession } = useSessionByKombuseId(selectedSessionId);
  const effectiveAgentId = isDraft ? selectedAgentId : (currentSession?.agent_id ?? null);
  const effectiveBackendType = isDraft
    ? draftBackendType
    : normalizeBackendType(currentSession?.effective_backend ?? currentSession?.backend_type);
  const effectiveModelPreference = isDraft
    ? draftModelPreference
    : (currentSession?.model_preference ?? "");

  // Helper to check if a session has pending permissions
  const sessionHasPendingPermission = (kombuseSessionId: string | null) => {
    if (!kombuseSessionId) return false
    return [...pendingPermissions.values()].some(p => p.sessionId === kombuseSessionId)
  }

  const Container = isProjectContext ? "div" : "main";
  const chatsBasePath = useMemo(() => {
    return projectId ? `/projects/${projectId}/chats` : "/chats";
  }, [projectId]);

  const handleNewChat = () => {
    setSelectedAgentId(null);
    setSelectedBackendTypeOverride(null);
    setSelectedModelPreferenceOverride(null);
    navigate(chatsBasePath);
  };

  const handleSelectSession = (sessionId: string) => {
    navigate(`${chatsBasePath}/${sessionId}`);
  };

  const ensureSessionForDraft = async () => {
    const session = await createSession.mutateAsync({
      backend_type: draftBackendType,
      agent_id: selectedAgentId ?? undefined,
      model_preference: draftModelPreference.trim().length > 0 ? draftModelPreference.trim() : undefined,
    });
    navigate(`${chatsBasePath}/${session.kombuse_session_id}`);
    return session.kombuse_session_id;
  };

  // Determine the key for ChatProvider to force remount when switching
  const chatKey = selectedSessionId ? `session-${selectedSessionId}` : "draft";

  return (
    <Container className={cn(
      "flex min-h-0",
      "h-full"
    )}>
      {/* Sidebar with sessions list */}
      <div className={cn(
        "w-64 border-r flex flex-col min-h-0",
        isProjectContext ? "" : "p-4"
      )}>
        <div className={cn(
          "flex items-center justify-between mb-4",
          isProjectContext && "p-4 border-b"
        )}>
          <h2 className="font-semibold">Sessions</h2>
          <button
            onClick={handleNewChat}
            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90"
          >
            New Chat
          </button>
        </div>

        {/* Sessions list */}
        <div className={cn("flex-1 min-h-0", !isProjectContext && "overflow-y-auto")}>
          <SessionList
            sessions={sessions ?? []}
            className={isProjectContext ? "h-full min-h-0" : undefined}
            variant={isProjectContext ? "card" : "default"}
            selectedSessionId={selectedSessionId}
            onSessionClick={(session) => handleSelectSession(session.kombuse_session_id!)}
            onSessionDelete={(session) => {
              deleteSession.mutate(session.kombuse_session_id!)
              if (selectedSessionId === session.kombuse_session_id) {
                navigate(chatsBasePath)
              }
            }}
            isSessionPendingPermission={sessionHasPendingPermission}
            isLoading={sessionsLoading}
          />
        </div>
      </div>

      {/* Main chat area */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0",
        isProjectContext ? "" : "p-4"
      )}>
        <div className={cn(
          "flex items-center gap-4 mb-4 shrink-0",
          isProjectContext && "p-4 border-b"
        )}>
          <h1 className="text-2xl font-bold">
            {isProjectContext ? "Chats" : "Chat"}
          </h1>
          <div className="flex items-center gap-2">
            <label htmlFor="chat-backend-select" className="text-sm text-muted-foreground">Backend</label>
            <select
              id="chat-backend-select"
              value={effectiveBackendType}
              onChange={(event) => setSelectedBackendTypeOverride(event.target.value as BackendType)}
              disabled={!isDraft}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value={BACKEND_TYPES.CLAUDE_CODE}>Claude Code</option>
              <option value={BACKEND_TYPES.CODEX}>Codex</option>
              {effectiveBackendType === BACKEND_TYPES.MOCK ? (
                <option value={BACKEND_TYPES.MOCK}>Mock</option>
              ) : null}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="chat-model-input" className="text-sm text-muted-foreground">Model</label>
            <input
              id="chat-model-input"
              value={effectiveModelPreference}
              onChange={(event) => setSelectedModelPreferenceOverride(event.target.value)}
              disabled={!isDraft}
              placeholder="Use backend default"
              className="h-9 w-52 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatProvider
            key={chatKey}
            sessionId={selectedSessionId}
            agentId={effectiveAgentId ?? undefined}
            projectId={projectId ?? null}
            backendType={effectiveBackendType}
            modelPreference={isDraft ? draftModelPreference : undefined}
            onEnsureSession={selectedSessionId ? undefined : ensureSessionForDraft}
          >
            <Chat
              emptyMessage={
                selectedSessionId
                  ? "Loading session..."
                  : "Start a conversation..."
              }
              inputToolbarControls={
                <AgentPicker
                  value={effectiveAgentId}
                  onChange={setSelectedAgentId}
                  disabled={!isDraft}
                  className="h-8 w-[220px] max-w-full"
                />
              }
              className="h-full"
            />
          </ChatProvider>
        </div>
      </div>
    </Container>
  );
}
