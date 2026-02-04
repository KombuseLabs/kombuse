import { useState } from "react";
import { useParams } from "react-router-dom";
import { Chat } from "@kombuse/ui/components";
import { useAgents, useSessions } from "@kombuse/ui/hooks";
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

function SessionItem({
  session,
  isSelected,
  onClick,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
        isSelected
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted"
      )}
    >
      <div className="font-medium truncate">
        {session.kombuse_session_id?.slice(0, 8) || session.id.slice(0, 8)}
      </div>
      <div className={cn(
        "text-xs",
        isSelected ? "text-primary-foreground/70" : "text-muted-foreground"
      )}>
        {formatDate(session.started_at)}
        <span className="ml-2 capitalize">{session.status}</span>
      </div>
    </button>
  );
}

export function Chats() {
  const { projectId } = useParams<{ projectId?: string }>();
  const isProjectContext = Boolean(projectId);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const { data: agents } = useAgents({ is_enabled: true });
  const { data: sessions, isLoading: sessionsLoading } = useSessions();

  const Container = isProjectContext ? "div" : "main";

  const handleNewChat = () => {
    setSelectedSessionId(null);
  };

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
  };

  // Determine the key for ChatProvider to force remount when switching
  const chatKey = selectedSessionId
    ? `session-${selectedSessionId}`
    : selectedAgentId
      ? `agent-${selectedAgentId}`
      : null;

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

        {/* Agent selector for new chats */}
        {!selectedSessionId && (
          <div className="px-3 mb-4">
            <select
              className="w-full rounded border bg-background px-2 py-1.5 text-sm"
              value={selectedAgentId ?? ""}
              onChange={(e) => setSelectedAgentId(e.target.value || null)}
            >
              <option value="">Select agent...</option>
              {agents?.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.id}
                </option>
              ))}
            </select>
          </div>
        )}

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
            {selectedSessionId ? "Session History" : isProjectContext ? "Chats" : "Chat"}
          </h1>
          {selectedSessionId && (
            <span className="text-sm text-muted-foreground">
              (Read-only)
            </span>
          )}
        </div>

        <div className="flex-1 min-h-0">
          {chatKey ? (
            <ChatProvider
              key={chatKey}
              agentId={selectedSessionId ? undefined : selectedAgentId ?? undefined}
              sessionId={selectedSessionId}
            >
              <Chat
                emptyMessage={selectedSessionId ? "Loading session..." : "Start a conversation..."}
                className="h-full"
              />
            </ChatProvider>
          ) : (
            <Chat
              events={[]}
              onSubmit={() => {}}
              emptyMessage="Select an agent or session to begin"
              className="h-full"
            />
          )}
        </div>
      </div>
    </Container>
  );
}
