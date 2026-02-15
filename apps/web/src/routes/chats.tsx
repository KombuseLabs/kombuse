import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
} from "@kombuse/ui/base";
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
const CHATS_PANEL_LAYOUT_KEY = "chats-panel-layout";

export function Chats() {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId?: string;
  }>();
  const selectedSessionId = sessionId ?? null;
  const isDraft = !selectedSessionId;

  const { data: sessions, isLoading: sessionsLoading } = useSessions({ project_id: projectId, sort_by: 'updated_at' });
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

  const chatsBasePath = useMemo(() => {
    return `/projects/${projectId}/chats`;
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
      project_id: projectId,
    });
    navigate(`${chatsBasePath}/${session.kombuse_session_id}`);
    return session.kombuse_session_id;
  };

  // Determine the key for ChatProvider to force remount when switching
  const chatKey = selectedSessionId ? `session-${selectedSessionId}` : "draft";

  // Resizable panel layout persistence
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const stored = localStorage.getItem(CHATS_PANEL_LAYOUT_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return undefined;
      }
    }
    return undefined;
  });

  const handleLayoutChanged = useCallback((layout: Record<string, number>) => {
    localStorage.setItem(CHATS_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  }, []);

  const showDetailPanel = selectedSessionId !== null;

  const sessionListContent = (
    <SessionList
      sessions={sessions ?? []}
      className="h-full min-h-0"
      variant="card"
      header={
        <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
          <h1 className="text-2xl font-bold">Sessions</h1>
          <Button onClick={handleNewChat}>New Chat</Button>
        </div>
      }
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
  );

  const chatDetailContent = (
    <>
      <div className={cn(
        "flex items-center gap-4 shrink-0 p-4 border-b"
      )}>
        <h1 className="text-2xl font-bold">Chats</h1>
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
    </>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-1 overflow-hidden">
        {showDetailPanel ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={50} minSize={25} className="min-h-0">
              <ResizableCardPanel side="list">
                {sessionListContent}
              </ResizableCardPanel>
            </ResizablePanel>

            <ResizableCardHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25} className="min-h-0">
              <ResizableCardPanel side="detail">
                <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                  {chatDetailContent}
                </Card>
              </ResizableCardPanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="w-full h-full min-h-0 pt-3 px-6 pb-6">
            {sessionListContent}
          </div>
        )}
      </div>
    </div>
  );
}
