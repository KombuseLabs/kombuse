import { useState } from "react";
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
} from "@kombuse/ui/hooks";
import { Plus, X, Save } from "lucide-react";
import type { Agent, Profile } from "@kombuse/types";

export function ProjectAgents() {
  const { projectId, agentId } = useParams<{
    projectId: string;
    agentId?: string;
  }>();
  const navigate = useNavigate();
  const isCreating = agentId === "new";

  const { data: agents, isLoading, error } = useAgents();
  const { data: profiles } = useAgentProfiles();
  const { data: selectedAgentData, isLoading: isLoadingAgent } =
    useAgentWithProfile(isCreating ? "" : agentId || "");

  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const updateProfile = useUpdateProfile();
  const toggleAgent = useToggleAgent();
  const deleteAgent = useDeleteAgent();

  // Create form state
  const [newAgentName, setNewAgentName] = useState("");
  const [newAgentDescription, setNewAgentDescription] = useState("");
  const [newAgentAvatar, setNewAgentAvatar] = useState("bot");
  const [newAgentPrompt, setNewAgentPrompt] = useState("");

  // Track saving state
  const [isSaving, setIsSaving] = useState(false);

  // Build a map of agent ID to profile for quick lookup
  const profileMap = new Map<string, Profile>();
  profiles?.forEach((p) => profileMap.set(p.id, p));

  const handleAgentClick = (agent: Agent) => {
    navigate(`/projects/${projectId}/agents/${agent.id}`);
  };

  const handleCloseDetail = () => {
    navigate(`/projects/${projectId}/agents`);
  };

  const handleStartCreate = () => {
    resetCreateForm();
    navigate(`/projects/${projectId}/agents/new`);
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
          navigate(`/projects/${projectId}/agents/${agent.id}`);
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
    agent: { system_prompt?: string };
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
    navigate(`/projects/${projectId}/agents`);
  };

  const showDetailPanel = agentId !== undefined;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <h1 className="text-2xl font-bold">Agents</h1>
        <Button onClick={handleStartCreate} disabled={isCreating}>
          <Plus className="size-4" />
          Create Agent
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Agent List */}
        <div
          className={`${
            showDetailPanel ? "w-1/2 border-r" : "w-full"
          } overflow-y-auto p-6`}
        >
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
            <div className="grid gap-4">
              {agents.length === 0 && !isCreating ? (
                <div className="text-center py-8 text-muted-foreground">
                  No agents yet. Create one to get started.
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
                      isSelected={agent.id === agentId}
                      onClick={() => handleAgentClick(agent)}
                      onToggle={(enabled) =>
                        toggleAgent.mutate({ id: agent.id, is_enabled: enabled })
                      }
                      isToggling={toggleAgent.isPending}
                    />
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Detail Panel - Create or Edit */}
        {showDetailPanel && (
          <div className="w-1/2">
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
                    onClose={handleCloseDetail}
                    onSave={handleSaveAgent}
                    onDelete={handleDeleteAgent}
                    isSaving={isSaving}
                    isDeleting={deleteAgent.isPending}
                  />
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
