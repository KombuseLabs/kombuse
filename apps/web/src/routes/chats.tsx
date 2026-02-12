import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chat, SessionList } from "@kombuse/ui/components";
import { useCreateSession, useSessions, useAppContext, useDeleteSession } from "@kombuse/ui/hooks";
import { ChatProvider } from "@kombuse/ui/providers";
import { cn } from "@kombuse/ui/lib/utils";

export function Chats() {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{
    projectId?: string;
    sessionId?: string;
  }>();
  const isProjectContext = Boolean(projectId);
  const selectedSessionId = sessionId ?? null;

  const { data: sessions, isLoading: sessionsLoading } = useSessions({ sort_by: 'updated_at' });
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();
  const { pendingPermissions } = useAppContext();

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
    navigate(chatsBasePath);
  };

  const handleSelectSession = (sessionId: string) => {
    navigate(`${chatsBasePath}/${sessionId}`);
  };

  const ensureSessionForDraft = async () => {
    const session = await createSession.mutateAsync({
      backend_type: "claude-code",
    });
    navigate(`${chatsBasePath}/${session.kombuse_session_id}`);
    return session.kombuse_session_id;
  };

  // Determine the key for ChatProvider to force remount when switching
  const chatKey = selectedSessionId ? `session-${selectedSessionId}` : "draft";

  return (
    <Container className={cn(
      "flex",
      isProjectContext ? "h-full" : "h-[calc(100vh-var(--header-height))]"
    )}>
      {/* Sidebar with sessions list */}
      <div className={cn(
        "w-64 border-r flex flex-col",
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
        <div className="flex-1 overflow-y-auto">
          <SessionList
            sessions={sessions ?? []}
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
        </div>

        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <ChatProvider
            key={chatKey}
            sessionId={selectedSessionId}
            projectId={projectId ?? null}
            onEnsureSession={selectedSessionId ? undefined : ensureSessionForDraft}
          >
            <Chat
              emptyMessage={
                selectedSessionId
                  ? "Loading session..."
                  : "Start a conversation..."
              }
              className="h-full"
            />
          </ChatProvider>
        </div>
      </div>
    </Container>
  );
}
