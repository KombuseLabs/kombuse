import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@kombuse/ui/base";
import { ArrowRight, Folder, FolderOpen, Loader2, Plus } from "lucide-react";
import {
  useCreateProject,
  useProjects,
  useClaudeCodeProjects,
  useImportClaudeCodeProjects,
  useDesktop,
  useUpdates,
  useShellUpdates,
} from "@kombuse/ui/hooks";
import { deriveProjectNameFromPath } from "../utils/projects-path";

export function Home() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: discovered, isLoading: scanLoading } = useClaudeCodeProjects();
  const importMutation = useImportClaudeCodeProjects();
  const { status: appStatus } = useUpdates();
  const { status: shellStatus } = useShellUpdates();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    setCreateOpen(searchParams.get("create") === "true");
  }, [searchParams]);

  function setCreateDialogOpen(open: boolean) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (open) {
        next.set("create", "true");
      } else {
        next.delete("create");
      }
      return next;
    }, { replace: true });
  }

  const available = discovered?.filter((p) => !p.isImported) ?? [];
  const hasProjects = projects && projects.length > 0;
  const isLoading = projectsLoading || scanLoading;

  function togglePath(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(available.map((p) => p.path)));
  }

  async function handleImport() {
    if (selected.size === 0) return;
    await importMutation.mutateAsync([...selected]);
    setSelected(new Set());
  }

  return (
    <main className="flex flex-col items-center min-h-full">
      {/* Hero with splash glow */}
      <section className="relative w-full flex flex-col items-center justify-center py-24 overflow-hidden">
        <div className="kombuse-glow" />
        <h1 className="relative z-10 text-5xl sm:text-6xl font-extralight tracking-tighter leading-tight kombuse-fade-up">
          <span className="kombuse-gradient-text">Cook it. Ship it.</span>
        </h1>
      </section>

      <div className="w-full max-w-3xl mx-auto px-8 pb-16 space-y-10">
        {/* Imported Projects */}
        {hasProjects && (
          <section className="kombuse-fade-up kombuse-delay-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Your Projects
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setCreateDialogOpen(true)}
              >
                <Plus className="size-3.5 mr-1.5" />
                New Project
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => (
                <Link key={project.id} to={`/projects/${project.slug}/tickets`}>
                  <Card className="group cursor-pointer border-border/60 hover:border-primary/20 transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Folder className="size-4 text-muted-foreground shrink-0" />
                        <span className="font-medium text-sm truncate">
                          {project.name}
                        </span>
                        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0" />
                      </div>
                      {project.local_path && (
                        <p className="text-xs text-muted-foreground truncate mt-1.5 ml-7 font-mono">
                          {project.local_path}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 kombuse-fade-up kombuse-delay-1">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="ml-3 text-sm text-muted-foreground">
              Scanning for projects…
            </span>
          </div>
        )}

        {/* Discovered but not imported projects */}
        {!isLoading && available.length > 0 && (
          <section className="kombuse-fade-up kombuse-delay-2 rounded-xl border border-border/60 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Discovered from Claude Code
              </h2>
              <div className="flex items-center gap-2">
                {!hasProjects && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setCreateDialogOpen(true)}
                  >
                    <Plus className="size-3.5 mr-1.5" />
                    New Project
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  onClick={selectAll}
                >
                  Select all
                </Button>
              </div>
            </div>
            <div className="max-h-[40vh] overflow-y-auto p-2 space-y-1.5">
              {available.map((project) => (
                <label
                  key={project.path}
                  className="flex items-start gap-3 rounded-lg p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                >
                  <Checkbox
                    checked={selected.has(project.path)}
                    onCheckedChange={() => togglePath(project.path)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{project.name}</div>
                    <div className="text-xs text-muted-foreground truncate font-mono mt-0.5">
                      {project.path}
                    </div>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{project.totalSessions} sessions</span>
                      <span>{project.totalMessages} messages</span>
                      {project.gitBranch && <span>{project.gitBranch}</span>}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-border/40">
              {importMutation.isError && (
                <p className="text-sm text-destructive">Import failed. Please try again.</p>
              )}
              <Button
                onClick={handleImport}
                disabled={selected.size === 0 || importMutation.isPending}
                className="kombuse-gradient-bg text-white font-medium px-6 disabled:opacity-40"
              >
                {importMutation.isPending && (
                  <Loader2 className="size-4 mr-2 animate-spin" />
                )}
                Import{selected.size > 0 ? ` (${selected.size})` : ""}
              </Button>
            </div>
          </section>
        )}

        {/* Empty state */}
        {!isLoading && !hasProjects && available.length === 0 && (
          <section className="text-center py-8 kombuse-fade-up kombuse-delay-1">
            <FolderOpen className="size-10 text-muted-foreground/40 mx-auto mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              No projects discovered. Use Claude Code in a project directory to
              get started, or create a project manually.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="size-4 mr-2" />
              New Project
            </Button>
          </section>
        )}
        <Dialog open={createOpen} onOpenChange={setCreateDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <CreateProjectDialog
              open={createOpen}
              onDone={() => setCreateDialogOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      {(appStatus?.currentVersion || shellStatus?.currentVersion) && (
        <footer className="kombuse-fade-up kombuse-delay-2 mt-auto pt-4 pb-8 text-center text-xs text-muted-foreground">
          {[
            appStatus?.currentVersion && `v${appStatus.currentVersion}`,
            shellStatus?.currentVersion &&
              `shell v${shellStatus.currentVersion}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </footer>
      )}
    </main>
  );
}

function CreateProjectDialog({
  open,
  onDone,
}: {
  open: boolean;
  onDone: () => void;
}) {
  const { isDesktop, selectDirectory } = useDesktop();
  const createProject = useCreateProject();
  const [localPath, setLocalPath] = useState("");
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);

  function resetForm() {
    setLocalPath("");
    setName("");
    setNameTouched(false);
  }

  useEffect(() => {
    if (!open) {
      setLocalPath("");
      setName("");
      setNameTouched(false);
    }
  }, [open]);

  function updatePath(nextPath: string) {
    setLocalPath(nextPath);
    if (!nameTouched) {
      setName(deriveProjectNameFromPath(nextPath));
    }
  }

  async function handleSelectDirectory() {
    const selectedPath = await selectDirectory();
    if (selectedPath) {
      updatePath(selectedPath);
    }
  }

  async function handleCreate() {
    const trimmedName = name.trim();
    const trimmedPath = localPath.trim();
    if (!trimmedName || !trimmedPath) return;

    await createProject.mutateAsync({
      name: trimmedName,
      owner_id: "user-1",
      local_path: trimmedPath,
    });

    resetForm();
    onDone();
  }

  function handleCancel() {
    resetForm();
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create Project</DialogTitle>
        <DialogDescription>
          Choose a local directory to create a project. The folder name is used
          as the default project name.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="project-local-path">Directory path</Label>
          <div className="flex gap-2">
            <Input
              id="project-local-path"
              value={localPath}
              onChange={(event) => updatePath(event.target.value)}
              placeholder={isDesktop ? "Select a directory" : "/path/to/project"}
              autoFocus
            />
            {isDesktop && (
              <Button
                type="button"
                variant="outline"
                onClick={handleSelectDirectory}
                disabled={createProject.isPending}
              >
                <FolderOpen className="size-4 mr-2" />
                Open
              </Button>
            )}
          </div>
          {!isDesktop && (
            <p className="text-xs text-muted-foreground">
              Browser mode does not support a native directory picker.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-name">Project name</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setNameTouched(true);
            }}
            placeholder="my-project"
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleCancel} disabled={createProject.isPending}>
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={createProject.isPending || !name.trim() || !localPath.trim()}
        >
          {createProject.isPending && (
            <Loader2 className="size-4 mr-2 animate-spin" />
          )}
          Create Project
        </Button>
      </DialogFooter>
    </>
  );
}
