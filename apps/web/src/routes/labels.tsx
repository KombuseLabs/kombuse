import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@kombuse/ui/base";
import { LabelCard, LabelDetail, LabelForm } from "@kombuse/ui/components";
import {
  useProjectLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
} from "@kombuse/ui/hooks";
import { Plus, X, Tags } from "lucide-react";
import type { Label } from "@kombuse/types";

const LABELS_PANEL_LAYOUT_KEY = "labels-panel-layout";

export function Labels() {
  const { projectId, labelId } = useParams<{
    projectId: string;
    labelId?: string;
  }>();
  const navigate = useNavigate();
  const isCreating = labelId === "new";
  const basePath = `/projects/${projectId}/labels`;

  const { data: labels, isLoading, error } = useProjectLabels(projectId ?? "");
  const createLabel = useCreateLabel(projectId ?? "");
  const updateLabel = useUpdateLabel(projectId ?? "");
  const deleteLabel = useDeleteLabel(projectId ?? "");

  const [searchQuery, setSearchQuery] = useState("");

  // Resizable panel layout persistence
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const stored = localStorage.getItem(LABELS_PANEL_LAYOUT_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return undefined;
      }
    }
    return undefined;
  });

  const handleLayoutChanged = useCallback(
    (layout: Record<string, number>) => {
      localStorage.setItem(LABELS_PANEL_LAYOUT_KEY, JSON.stringify(layout));
    },
    []
  );

  const filteredLabels = useMemo(() => {
    if (!labels) return [];
    if (!searchQuery.trim()) return labels;
    const q = searchQuery.toLowerCase();
    return labels.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.description?.toLowerCase().includes(q)
    );
  }, [labels, searchQuery]);

  const selectedLabel = useMemo(
    () => labels?.find((l) => l.id === Number(labelId)),
    [labels, labelId]
  );

  const handleLabelClick = (label: Label) => {
    navigate(`${basePath}/${label.id}`);
  };

  const handleCloseDetail = () => {
    navigate(basePath);
  };

  const handleStartCreate = () => {
    navigate(`${basePath}/new`);
  };

  const handleCreateLabel = async (data: {
    name: string;
    color: string;
    description?: string;
  }) => {
    const newLabel = await createLabel.mutateAsync({
      name: data.name,
      color: data.color,
      description: data.description,
    });
    navigate(`${basePath}/${newLabel.id}`);
  };

  const handleSaveLabel = async (data: {
    name?: string;
    color?: string;
    description?: string;
  }) => {
    if (!labelId || isCreating) return;
    await updateLabel.mutateAsync({
      id: Number(labelId),
      input: data,
    });
  };

  const handleDeleteLabel = async () => {
    if (!labelId || isCreating) return;
    await deleteLabel.mutateAsync(Number(labelId));
    navigate(basePath);
  };

  const handleNavigateToAgent = (agentId: string) => {
    navigate(`/projects/${projectId}/agents/${agentId}`);
  };

  const showDetailPanel = labelId !== undefined;

  const labelListContent = (
    <>
      {isLoading && (
        <div className="text-center py-8 text-muted-foreground">
          Loading labels...
        </div>
      )}

      {error && (
        <div className="text-center py-8 text-destructive">
          Error: {error.message}
        </div>
      )}

      {!isLoading && !error && labels && (
        <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          {filteredLabels.length === 0 && !isCreating ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery
                ? "No labels match your search."
                : "No labels yet. Create one to get started."}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {filteredLabels.map((label) => (
                  <LabelCard
                    key={label.id}
                    label={label}
                    isSelected={label.id === Number(labelId)}
                    onClick={() => handleLabelClick(label)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Labels</h1>
        </div>
        <div className="flex items-center gap-3">
          <Input
            placeholder="Search labels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48"
          />
          <Button onClick={handleStartCreate} disabled={isCreating}>
            <Plus className="size-4" />
            Create Label
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showDetailPanel ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={50} minSize={25}>
              <div className="h-full min-h-0 p-6">
                {labelListContent}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25}>
              {isCreating ? (
                <Card className="h-full flex flex-col">
                  <CardHeader className="pb-4 shrink-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-muted flex items-center justify-center">
                          <Tags className="size-5" />
                        </div>
                        <CardTitle className="text-xl">New Label</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleCloseDetail}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    <LabelForm
                      onSubmit={handleCreateLabel}
                      onCancel={handleCloseDetail}
                      isLoading={createLabel.isPending}
                    />
                  </CardContent>
                </Card>
              ) : selectedLabel ? (
                <LabelDetail
                  label={selectedLabel}
                  projectId={projectId ?? ""}
                  onClose={handleCloseDetail}
                  onSave={handleSaveLabel}
                  onDelete={handleDeleteLabel}
                  onNavigateToAgent={handleNavigateToAgent}
                  isSaving={updateLabel.isPending}
                  isDeleting={deleteLabel.isPending}
                />
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Label not found
                </div>
              )}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="w-full h-full min-h-0 p-6">{labelListContent}</div>
        )}
      </div>
    </div>
  );
}
