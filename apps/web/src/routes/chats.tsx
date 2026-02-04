import { useState } from "react";
import { useParams } from "react-router-dom";
import { Chat } from "@kombuse/ui/components";
import { useAgents } from "@kombuse/ui/hooks";
import { ChatProvider } from "@kombuse/ui/providers";
import { cn } from "@kombuse/ui/lib/utils";

export function Chats() {
  const { projectId } = useParams<{ projectId?: string }>();
  const isProjectContext = Boolean(projectId);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const { data: agents } = useAgents({ is_enabled: true });

  const Container = isProjectContext ? "div" : "main";

  return (
    <Container className={cn(
      "flex flex-col",
      isProjectContext ? "h-full" : "h-[calc(100vh-4rem)] p-4"
    )}>
      <div className={cn(
        "flex items-center gap-4",
        isProjectContext ? "justify-between p-6 border-b" : "mb-4"
      )}>
        <h1 className="text-2xl font-bold">{isProjectContext ? "Chats" : "Chat"}</h1>
        <select
          className="rounded border bg-background px-3 py-1.5 text-sm"
          value={selectedAgentId ?? ""}
          onChange={(e) => setSelectedAgentId(e.target.value || null)}
        >
          <option value="">Select an agent...</option>
          {agents?.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.id}
            </option>
          ))}
        </select>
      </div>

      <div className={cn(
        "flex-1 min-h-0",
        isProjectContext && "p-4"
      )}>
        {selectedAgentId ? (
          <ChatProvider key={selectedAgentId} agentId={selectedAgentId}>
            <Chat emptyMessage="Start a conversation..." className="h-full" />
          </ChatProvider>
        ) : (
          <Chat
            messages={[]}
            onSubmit={() => {}}
            emptyMessage="Select an agent to begin"
            className="h-full"
          />
        )}
      </div>
    </Container>
  );
}
