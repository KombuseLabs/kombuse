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
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  toast,
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
  useAvailablePlugins,
  useInstalledPlugins,
  useInstallPlugin,
} from "@kombuse/ui/hooks";
import type { TriggerFormData } from "@kombuse/ui/components";
import { Plus, Bot, X, Save, Package } from "lucide-react";
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

  // Plugin hooks for onboarding
  const { data: availablePlugins } = useAvailablePlugins(projectId ?? "");
  const { data: installedPlugins } = useInstalledPlugins(projectId ?? "");
  const installPlugin = useInstallPlugin();
  const [dismissed, setDismissed] = useState(() => {
    if (!projectId) return false;
    return localStorage.getItem(`plugin-onboarding-dismissed-${projectId}`) === "true";
  });

  const uninstalledPlugins = availablePlugins?.filter((p) => !p.installed) ?? [];
  const hasNoPlugins = (installedPlugins?.length ?? 0) === 0;
  const showOnboarding = hasNoPlugins && uninstalledPlugins.length > 0 && !dismissed;

  const handleInstallPlugin = (directory: string) => {
    if (!projectId) return;
    installPlugin.mutate(
      { package_path: directory, project_id: projectId },
      {
        onSuccess: (result) => {
          toast.success(
            `Installed "${result.plugin_name}": ${result.agents_created} created, ${result.agents_updated} updated, ${result.labels_created} labels`
          );
        },
        onError: (err) => {
          toast.error(`Failed to install plugin: ${err.message}`);
        },
      }
    );
  };

  const handleDismissOnboarding = () => {
    if (projectId) {
      localStorage.setItem(`plugin-onboarding-dismissed-${projectId}`, "true");
    }
    setDismissed(true);
  };

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
        name: newAgentName.trim(),
        description: newAgentDescription.trim() || newAgentName.trim(),
        avatar_url: newAgentAvatar,
        system_prompt: newAgentPrompt,
        is_enabled: true,
      },
      {
        onSuccess: (agent) => {
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
          ? "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
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
            showOnboarding ? (
              <div className="flex flex-col items-center justify-center gap-4 py-12 px-6 text-center">
                <Package className="size-10 text-muted-foreground" />
                <div>
                  <h3 className="text-lg font-semibold">Get started with agents</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                    Install the default plugin to get pre-configured agents for triage, planning, code review, and more.
                  </p>
                </div>
                <div className="flex gap-2">
                  {uninstalledPlugins.map((plugin) => (
                    <Button
                      key={plugin.name}
                      onClick={() => handleInstallPlugin(plugin.directory)}
                      disabled={installPlugin.isPending}
                    >
                      <Package className="size-4" />
                      {installPlugin.isPending ? "Installing..." : `Install ${plugin.name}`}
                    </Button>
                  ))}
                </div>
                <button
                  onClick={handleDismissOnboarding}
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                >
                  Start from scratch
                </button>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No agents yet. Create one to get started.
              </div>
            )
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

  const agentDetailContent = isCreating ? (
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

      <CardContent data-testid="create-agent-form-scroll" className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-6 pr-1">
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
          <div className="flex min-h-0 flex-1 flex-col space-y-2">
            <Label>System Prompt *</Label>
            <PromptEditor
              value={newAgentPrompt}
              onChange={setNewAgentPrompt}
              placeholder="Enter the agent's system prompt..."
              showAvailableVariables
              fillHeight
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
              {isProjectContext ? (
                <ResizableCardPanel side="list">
                  {agentListContent}
                </ResizableCardPanel>
              ) : (
                <div className="h-full overflow-y-auto p-6">
                  {agentListContent}
                </div>
              )}
            </ResizablePanel>

            {isProjectContext ? <ResizableCardHandle /> : <ResizableHandle withHandle />}

            <ResizablePanel id="detail" defaultSize={50} minSize={25}>
              {isProjectContext ? (
                <ResizableCardPanel side="detail">
                  {agentDetailContent}
                </ResizableCardPanel>
              ) : (
                agentDetailContent
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className={isProjectContext ? "w-full h-full min-h-0 pt-3 px-6 pb-6" : "w-full overflow-y-auto p-6"}>
            {agentListContent}
          </div>
        )}
      </div>
    </Container>
  );
}
