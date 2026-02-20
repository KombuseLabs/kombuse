import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Switch,
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
} from "@kombuse/ui/base";
import { LabelCard, LabelDetail, LabelForm } from "@kombuse/ui/components";
import {
  useProjectLabels,
  useCreateLabel,
  useUpdateLabel,
  useDeleteLabel,
  useInstalledPlugins,
  useUpdatePlugin,
} from "@kombuse/ui/hooks";
import { Plus, X, Tags, Puzzle, ChevronDown } from "lucide-react";
import type { Label } from "@kombuse/types";
import type { Plugin } from "@kombuse/types";

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

  // Plugin hooks for grouping
  const { data: installedPlugins } = useInstalledPlugins(projectId ?? "");
  const updatePlugin = useUpdatePlugin();

  const pluginMap = useMemo(() => {
    const map = new Map<string, Plugin>();
    installedPlugins?.forEach((p) => map.set(p.id, p));
    return map;
  }, [installedPlugins]);

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

  const labelSections = useMemo(() => {
    if (!filteredLabels.length) return [];
    const groups = new Map<string | null, Label[]>();
    for (const label of filteredLabels) {
      const key = label.plugin_id ?? null;
      const group = groups.get(key);
      if (group) group.push(label);
      else groups.set(key, [label]);
    }
    const sections: { pluginId: string | null; plugin: Plugin | null; labels: Label[] }[] = [];
    const pluginEntries = [...groups.entries()].filter(([key]) => key !== null) as [string, Label[]][];
    pluginEntries.sort((a, b) => {
      const pa = pluginMap.get(a[0]);
      const pb = pluginMap.get(b[0]);
      return (pa?.installed_at ?? "").localeCompare(pb?.installed_at ?? "");
    });
    for (const [pluginId, labelList] of pluginEntries) {
      sections.push({ pluginId, plugin: pluginMap.get(pluginId) ?? null, labels: labelList });
    }
    const custom = groups.get(null);
    if (custom?.length) {
      sections.push({ pluginId: null, plugin: null, labels: custom });
    }
    return sections;
  }, [filteredLabels, pluginMap]);

  const LABEL_SECTIONS_STORAGE_KEY = `label-plugin-sections-${projectId}`;
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    const stored = localStorage.getItem(LABEL_SECTIONS_STORAGE_KEY);
    if (stored) {
      try { return JSON.parse(stored); } catch { return {}; }
    }
    return {};
  });

  const toggleSection = useCallback((sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = { ...prev, [sectionKey]: !prev[sectionKey] };
      localStorage.setItem(LABEL_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [LABEL_SECTIONS_STORAGE_KEY]);

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
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
            <h1 className="text-2xl font-bold">Labels</h1>
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
          {filteredLabels.length === 0 && !isCreating ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery
                ? "No labels match your search."
                : "No labels yet. Create one to get started."}
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              <div className="space-y-1">
                {labelSections.map((section) => {
                  const sectionKey = section.pluginId ?? "custom";
                  const isCollapsed = collapsedSections[sectionKey] ?? false;
                  return (
                    <Collapsible
                      key={sectionKey}
                      open={!isCollapsed}
                      onOpenChange={() => toggleSection(sectionKey)}
                    >
                      <div className="flex items-center gap-2 px-2 py-2">
                        <CollapsibleTrigger className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer">
                          <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                          {section.plugin ? (
                            <Puzzle className="size-3.5 shrink-0 text-muted-foreground" />
                          ) : null}
                          <span className="text-sm font-medium text-muted-foreground truncate">
                            {section.plugin?.name ?? "Custom"}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                            {section.labels.length}
                          </Badge>
                        </CollapsibleTrigger>
                        {section.plugin && (
                          <Switch
                            checked={section.plugin.is_enabled}
                            onCheckedChange={(checked) => {
                              updatePlugin.mutate({ id: section.plugin!.id, input: { is_enabled: checked } });
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={updatePlugin.isPending}
                          />
                        )}
                      </div>
                      <CollapsibleContent>
                        <div className="space-y-1">
                          {section.labels.map((label) => (
                            <LabelCard
                              key={label.id}
                              label={label}
                              pluginName={section.plugin?.name}
                              isSelected={label.id === Number(labelId)}
                              onClick={() => handleLabelClick(label)}
                            />
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );

  const labelDetailContent = isCreating ? (
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
      pluginName={selectedLabel.plugin_id ? pluginMap.get(selectedLabel.plugin_id)?.name : undefined}
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
            <ResizablePanel id="list" defaultSize={50} minSize={25}>
              <ResizableCardPanel side="list">
                {labelListContent}
              </ResizableCardPanel>
            </ResizablePanel>

            <ResizableCardHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25}>
              <ResizableCardPanel side="detail">
                {labelDetailContent}
              </ResizableCardPanel>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="w-full h-full min-h-0 pt-3 px-6 pb-6">{labelListContent}</div>
        )}
      </div>
    </div>
  );
}
