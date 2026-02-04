import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chat, StatusIndicator, type StatusIndicatorStatus } from "@kombuse/ui/components";
import { useCreateSession, useSessions, useAppContext } from "@kombuse/ui/hooks";
import { ChatProvider } from "@kombuse/ui/providers";
import { cn } from "@kombuse/ui/lib/utils";
import type { Session } from "@kombuse/types";

function formatDate(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getIndicatorStatus(
  session: Session,
  pendingSessionIds: Set<string>
): StatusIndicatorStatus {
  if (
    session.kombuse_session_id &&
    pendingSessionIds.has(session.kombuse_session_id)
  ) {
    return 'pending'
  }
  if (session.status === 'running') {
    return 'running'
  }
  if (session.status === 'failed') {
    return 'error'
  }
  return 'idle'
}

function SessionItem({
  session,
  isSelected,
  onClick,
  pendingSessionIds,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
  pendingSessionIds: Set<string>;
}) {
  const indicatorStatus = getIndicatorStatus(session, pendingSessionIds)

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors relative",
        isSelected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted"
      )}
    >
      <StatusIndicator
        status={indicatorStatus}
        size="sm"
        className="absolute top-2.5 left-1.5"
      />
      <div className="font-medium truncate pl-3">
        {session.kombuse_session_id?.slice(0, 8) || session.id.slice(0, 8)}
      </div>
      <div className={cn(
        "text-xs pl-3",
        isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
      )}>
        {formatDate(session.started_at)}
      </div>
    </button>
  );
}

export function Chats() {
  const navigate = useNavigate();
  const { projectId, sessionId } = useParams<{
    projectId?: string;
    sessionId?: string;
  }>();
  const isProjectContext = Boolean(projectId);
  const selectedSessionId = sessionId ?? null;

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const createSession = useCreateSession();
  const { pendingSessionIds } = useAppContext();

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
    navigate(`${chatsBasePath}/${session.id}`);
    return session.id;
  };

  // Determine the key for ChatProvider to force remount when switching
  const chatKey = selectedSessionId ? `session-${selectedSessionId}` : "draft";

  return (
    <Container className={cn(
      "flex",
      isProjectContext ? "h-full" : "h-[calc(100vh-4rem)]"
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
        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          {sessionsLoading ? (
            <div className="text-sm text-muted-foreground px-3 py-2">
              Loading sessions...
            </div>
          ) : sessions && sessions.length > 0 ? (
            sessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isSelected={selectedSessionId === session.id}
                onClick={() => handleSelectSession(session.id)}
                pendingSessionIds={pendingSessionIds}
              />
            ))
          ) : (
            <div className="text-sm text-muted-foreground px-3 py-2">
              No sessions yet
            </div>
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className={cn(
        "flex-1 flex flex-col min-h-0",
        isProjectContext ? "" : "p-4"
      )}>
        <div className={cn(
          "flex items-center gap-4 mb-4",
          isProjectContext && "p-4 border-b"
        )}>
          <h1 className="text-2xl font-bold">
            {isProjectContext ? "Chats" : "Chat"}
          </h1>
        </div>

        <div className="flex-1 min-h-0">
          <ChatProvider
            key={chatKey}
            sessionId={selectedSessionId}
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
