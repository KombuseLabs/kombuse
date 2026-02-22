import { useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@kombuse/ui/base";
import { AgentPicker, Chat, ModelSelector, SessionList } from "@kombuse/ui/components";
import {
  useAvailableBackends,
  useCreateSession,
  useSessions,
  useSessionByKombuseId,
  useAppContext,
  useDeleteSession,
  useProfileSetting,
} from "@kombuse/ui/hooks";
import { backendLabel, normalizeBackendType } from "@kombuse/ui/lib/backend-utils";
import { ChatProvider } from "@kombuse/ui/providers";
import { Plus } from "lucide-react";
import { BACKEND_TYPES, type BackendType, parseSessionId } from "@kombuse/types";

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

  const [activeTab, setActiveTab] = useState<'all' | 'chats' | 'system'>('all');
  const filteredSessions = useMemo(() => {
    if (!sessions || activeTab === 'all') return sessions ?? [];
    return sessions.filter((s) => {
      const parsed = s.kombuse_session_id ? parseSessionId(s.kombuse_session_id) : null;
      if (activeTab === 'chats') return parsed?.origin === 'chat';
      if (activeTab === 'system') return parsed?.origin === 'trigger';
      return true;
    });
  }, [sessions, activeTab]);

  const { availableBackends, isAvailable, noneAvailable } = useAvailableBackends();

  // Agent picker state (only used for draft/new chats)
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedBackendTypeOverride, setSelectedBackendTypeOverride] = useState<BackendType | null>(null);
  const [selectedModelPreferenceOverride, setSelectedModelPreferenceOverride] = useState<string | null>(null);
  const [draftCounter, setDraftCounter] = useState(0);

  const globalDefaultBackendType = normalizeBackendType(defaultBackendSetting?.setting_value);
  const globalDefaultModelPreference = (defaultModelSetting?.setting_value ?? "").trim();
  const rawDraftBackendType = selectedBackendTypeOverride ?? globalDefaultBackendType;
  const draftBackendType = isAvailable(rawDraftBackendType)
    ? rawDraftBackendType
    : (availableBackends[0] ?? rawDraftBackendType);
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
    setDraftCounter((c) => c + 1);
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
  const chatKey = selectedSessionId
    ? `session-${selectedSessionId}`
    : `draft-${draftCounter}`;

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

  const hasSessions = (sessions?.length ?? 0) > 0;
  const showSessionList = hasSessions || selectedSessionId != null;

  const sessionListContent = (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'all' | 'chats' | 'system')} className="h-full min-h-0 gap-0">
      <SessionList
        sessions={filteredSessions}
        className="h-full min-h-0"
        variant="card"
        header={
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold leading-tight">Sessions</h1>
              <Button onClick={handleNewChat}>
                <Plus className="size-4" />
                New Chat
              </Button>
            </div>
            <TabsList>
              <TabsTrigger value="chats">Chats</TabsTrigger>
              <TabsTrigger value="system">System</TabsTrigger>
              <TabsTrigger value="all">All</TabsTrigger>
            </TabsList>
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
    </Tabs>
  );

  const chatDetailContent = (
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
            <>
              <select
                value={effectiveBackendType}
                onChange={(e) => setSelectedBackendTypeOverride(e.target.value as BackendType)}
                disabled={!isDraft || noneAvailable}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {noneAvailable && (
                  <option value="" disabled>No backends available</option>
                )}
                {availableBackends.map((bt) => (
                  <option key={bt} value={bt}>{backendLabel(bt)}</option>
                ))}
                {effectiveBackendType === BACKEND_TYPES.MOCK && (
                  <option value={BACKEND_TYPES.MOCK}>Mock</option>
                )}
                {!isDraft && !isAvailable(effectiveBackendType) && effectiveBackendType !== BACKEND_TYPES.MOCK && (
                  <option value={effectiveBackendType} disabled>
                    {backendLabel(effectiveBackendType)} (not installed)
                  </option>
                )}
              </select>
              <ModelSelector
                backendType={effectiveBackendType}
                value={effectiveModelPreference}
                onChange={(modelId) => setSelectedModelPreferenceOverride(modelId)}
                disabled={!isDraft}
                className="w-40"
                showDefaultHint={false}
              />
              <AgentPicker
                value={effectiveAgentId}
                onChange={setSelectedAgentId}
                disabled={!isDraft}
                className="h-8 w-[180px] max-w-full"
                projectId={projectId}
              />
            </>
          }
          className="h-full"
        />
      </ChatProvider>
    </div>
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-1 overflow-hidden">
        {showSessionList ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={35} minSize={25} className="min-h-0">
              <ResizableCardPanel side="list">
                {sessionListContent}
              </ResizableCardPanel>
            </ResizablePanel>

            <ResizableCardHandle />

            <ResizablePanel id="detail" defaultSize={65} minSize={25} className="min-h-0">
              <ResizableCardPanel side="detail">
                <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                  {chatDetailContent}
                </Card>
              </ResizableCardPanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="w-full h-full min-h-0 pt-3 px-6 pb-6">
            <Card className="flex h-full min-h-0 flex-col overflow-hidden">
              {chatDetailContent}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
