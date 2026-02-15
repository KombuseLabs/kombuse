import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@kombuse/ui/base";
import {
  AgentCard,
  AgentDetail,
  AvatarPicker,
  PromptEditor,
} from "@kombuse/ui/components";
import {
  useAgents,
  useAgentWithProfile,
  useAgentProfiles,
  useCreateAgent,
  useUpdateAgent,
  useUpdateProfile,
  useToggleAgent,
  useDeleteAgent,
  useTriggers,
  useCreateTrigger,
  useUpdateTrigger,
  useDeleteTrigger,
  useToggleTrigger,
} from "@kombuse/ui/hooks";
import type { TriggerFormData } from "@kombuse/ui/components";
import { Plus, Bot, X, Save } from "lucide-react";
import type { Agent, AgentConfig, Permission, Profile } from "@kombuse/types";

const AGENTS_PANEL_LAYOUT_KEY = "agents-panel-layout";

export function Agents() {
  const { projectId, agentId } = useParams<{ projectId?: string; agentId?: string }>();
  const navigate = useNavigate();
  const isCreating = agentId === "new";
  const isProjectContext = Boolean(projectId);
  const basePath = isProjectContext ? `/projects/${projectId}/agents` : "/agents";

  const { data: agents, isLoading, error } = useAgents();
  const { data: profiles } = useAgentProfiles();
  const {
    data: selectedAgentData,
    isLoading: isLoadingAgent,
  } = useAgentWithProfile(isCreating ? "" : agentId || "");

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const updateProfile = useUpdateProfile();
  const toggleAgent = useToggleAgent();
  const deleteAgent = useDeleteAgent();

  // Trigger hooks
  const { data: triggers = [] } = useTriggers(isCreating ? "" : agentId ?? "");
  const createTrigger = useCreateTrigger();
  const updateTrigger = useUpdateTrigger();
  const deleteTrigger = useDeleteTrigger();
  const toggleTriggerMutation = useToggleTrigger();

  // Create form state
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentAvatar, setNewAgentAvatar] = useState("bot");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");

  // Track saving state
  const [isSaving, setIsSaving] = useState(false);

  // Resizable panel layout persistence
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const stored = localStorage.getItem(AGENTS_PANEL_LAYOUT_KEY);
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
    localStorage.setItem(AGENTS_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  }, []);

  // Build a map of agent ID to profile for quick lookup
  const profileMap = new Map<string, Profile>();
  profiles?.forEach((p) => profileMap.set(p.id, p));

  const handleAgentClick = (agent: Agent) => {
    navigate(`${basePath}/${agent.id}`);
  };

  const handleCloseDetail = () => {
    navigate(basePath);
  };

  const handleStartCreate = () => {
    resetCreateForm();
    navigate(`${basePath}/new`);
  };

  const handleCreateAgent = () => {
    if (!newAgentName.trim() || !newAgentPrompt.trim()) return;
    createAgent.mutate(
      {
        profile: {
          name: newAgentName.trim(),
          description: newAgentDescription.trim() || undefined,
          avatar_url: newAgentAvatar,
        },
        agent: {
          system_prompt: newAgentPrompt,
          is_enabled: true,
        },
      },
      {
        onSuccess: ({ agent }) => {
          resetCreateForm();
          navigate(`${basePath}/${agent.id}`);
        },
      }
    );
  };

  const resetCreateForm = () => {
    setNewAgentName("");
    setNewAgentDescription("");
    setNewAgentAvatar("bot");
    setNewAgentPrompt("");
  };

  const handleSaveAgent = async (updates: {
    profile: { name?: string; description?: string; avatar_url?: string };
    agent: { system_prompt?: string; permissions?: Permission[]; config?: AgentConfig };
  }) => {
    if (!agentId || isCreating) return;
    setIsSaving(true);
    try {
      await Promise.all([
        updateProfile.mutateAsync({ id: agentId, input: updates.profile }),
        updateAgent.mutateAsync({ id: agentId, input: updates.agent }),
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!agentId || isCreating) return;
    await deleteAgent.mutateAsync(agentId);
    navigate(basePath);
  };

  // Trigger handlers
  const handleCreateTrigger = async (data: TriggerFormData) => {
    if (!agentId || isCreating) return;
    await createTrigger.mutateAsync({ agentId, input: data });
  };

  const handleUpdateTrigger = async (id: number, data: Partial<TriggerFormData>) => {
    await updateTrigger.mutateAsync({ id, input: data });
  };

  const handleDeleteTrigger = async (id: number) => {
    await deleteTrigger.mutateAsync(id);
  };

  const handleToggleTrigger = async (id: number, enabled: boolean) => {
    await toggleTriggerMutation.mutateAsync({ id, is_enabled: enabled });
  };

  const showDetailPanel = agentId !== undefined;

  const Container = isProjectContext ? "div" : "main";

  const agentListContent = (
    <>
      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          Loading agents...
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive">
          Error: {error.message}
        </div>
      )}

      {!isLoading && !error && agents && (
        <div className={isProjectContext
          ? "flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
          : "rounded-lg border divide-y"}
        >
          {isProjectContext && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
              <h1 className="text-2xl font-bold">Agents</h1>
              <Button onClick={handleStartCreate} disabled={isCreating}>
                <Plus className="size-4" />
                Create Agent
              </Button>
            </div>
          )}
          {agents.length === 0 && !isCreating ? (
            <div className="text-center py-8 text-muted-foreground">
              No agents yet. Create one to get started.
            </div>
          ) : (
            isProjectContext ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                  {agents.map((agent) => {
                    const profile = profileMap.get(agent.id);
                    if (!profile) return null;
                    return (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        profile={profile}
                        variant="card"
                        isSelected={agent.id === agentId}
                        onClick={() => handleAgentClick(agent)}
                        onToggle={(enabled) =>
                          toggleAgent.mutate({ id: agent.id, is_enabled: enabled })
                        }
                        isToggling={toggleAgent.isPending}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              agents.map((agent) => {
                const profile = profileMap.get(agent.id);
                if (!profile) return null;
                return (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    profile={profile}
                    variant="default"
                    isSelected={agent.id === agentId}
                    onClick={() => handleAgentClick(agent)}
                    onToggle={(enabled) =>
                      toggleAgent.mutate({ id: agent.id, is_enabled: enabled })
                    }
                    isToggling={toggleAgent.isPending}
                  />
                );
              })
            )
          )}
        </div>
      )}
    </>
  );

  return (
    <Container className={isProjectContext ? "flex h-full min-h-0" : "flex flex-col h-full"}>
      {!isProjectContext && (
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-4">
            <Bot className="size-6" />
            <h1 className="text-2xl font-bold">Agents</h1>
          </div>
          <Button onClick={handleStartCreate} disabled={isCreating}>
            <Plus className="size-4" />
            Create Agent
          </Button>
        </div>
      )}

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {showDetailPanel ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={50} minSize={25}>
              <div className={isProjectContext ? "h-full min-h-0 p-6" : "h-full overflow-y-auto p-6"}>
                {agentListContent}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25}>
              {isCreating ? (
                // Create Form
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-4 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="size-12 rounded-lg bg-muted flex items-center justify-center">
                          <Plus className="size-6" />
                        </div>
                        <CardTitle className="text-xl">New Agent</CardTitle>
                      </div>
                      <Button variant="ghost" size="icon" onClick={handleCloseDetail}>
                        <X className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="flex-1 overflow-y-auto space-y-6">
                    {/* Name */}
                    <div className="space-y-2">
                      <Label htmlFor="new-agent-name">Name *</Label>
                      <Input
                        id="new-agent-name"
                        value={newAgentName}
                        onChange={(e) => setNewAgentName(e.target.value)}
                        placeholder="Agent name"
                        autoFocus
                      />
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label htmlFor="new-agent-description">Description</Label>
                      <Textarea
                        id="new-agent-description"
                        value={newAgentDescription}
                        onChange={(e) => setNewAgentDescription(e.target.value)}
                        placeholder="What does this agent do?"
                        className="min-h-20"
                      />
                    </div>

                    {/* Avatar */}
                    <div className="space-y-2">
                      <Label>Avatar</Label>
                      <AvatarPicker value={newAgentAvatar} onChange={setNewAgentAvatar} />
                    </div>

                    {/* System Prompt */}
                    <div className="space-y-2">
                      <Label>System Prompt *</Label>
                      <PromptEditor
                        value={newAgentPrompt}
                        onChange={setNewAgentPrompt}
                        placeholder="Enter the agent's system prompt..."
                        showAvailableVariables
                      />
                    </div>

                    {/* Create Button */}
                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button variant="outline" onClick={handleCloseDetail}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleCreateAgent}
                        disabled={
                          createAgent.isPending ||
                          !newAgentName.trim() ||
                          !newAgentPrompt.trim()
                        }
                      >
                        <Save className="size-4 mr-2" />
                        {createAgent.isPending ? "Creating..." : "Create Agent"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                // Edit existing agent
                <>
                  {isLoadingAgent && (
                    <div className="text-center py-8 text-muted-foreground">
                      Loading agent...
                    </div>
                  )}

                  {selectedAgentData && (
                    <AgentDetail
                      agent={selectedAgentData.agent}
                      profile={selectedAgentData.profile}
                      triggers={triggers}
                      onClose={handleCloseDetail}
                      onSave={handleSaveAgent}
                      onDelete={handleDeleteAgent}
                      onCreateTrigger={handleCreateTrigger}
                      onUpdateTrigger={handleUpdateTrigger}
                      onDeleteTrigger={handleDeleteTrigger}
                      onToggleTrigger={handleToggleTrigger}
                      isSaving={isSaving}
                      isDeleting={deleteAgent.isPending}
                      isCreatingTrigger={createTrigger.isPending}
                      isUpdatingTrigger={updateTrigger.isPending}
                    />
                  )}
                </>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className={isProjectContext ? "w-full h-full min-h-0 p-6" : "w-full overflow-y-auto p-6"}>
            {agentListContent}
          </div>
        )}
      </div>
    </Container>
  );
}
