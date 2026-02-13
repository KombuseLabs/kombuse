import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  Input,
  Label,
  DialogTitle,
  DialogTrigger,
} from "@kombuse/ui/base";
import { Download, Folder, FolderOpen, Loader2, Plus } from "lucide-react";
import {
  useCreateProject,
  useProjects,
  useClaudeCodeProjects,
  useImportClaudeCodeProjects,
  useDesktop,
} from "@kombuse/ui/hooks";

export function Projects() {
  const { data: projects, isLoading, error } = useProjects();
  const [searchParams, setSearchParams] = useSearchParams();
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

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

  return (
    <main className="flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Projects</h1>
        <div className="flex items-center gap-2">
          <Dialog open={createOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="size-4 mr-2" />
                New Project
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <CreateProjectDialog
                open={createOpen}
                onDone={() => setCreateDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="size-4 mr-2" />
                Import from Claude Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
              <ImportDialog onDone={() => setImportOpen(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive py-8 text-center">
          Failed to load projects: {error.message}
        </div>
      )}

      {!isLoading && !error && projects?.length === 0 && (
        <div className="text-sm text-muted-foreground py-8 text-center">
          No projects yet. Create a new project or import from Claude Code.
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {projects.map((project) => (
            <Link key={project.id} to={`/projects/${project.id}/tickets`}>
              <Card className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all h-full">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Folder className="size-5 text-muted-foreground" />
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {project.description && (
                    <p className="text-sm text-muted-foreground mb-3">
                      {project.description}
                    </p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    {project.repo_source && project.repo_owner && (
                      <span>
                        {project.repo_source}: {project.repo_owner}/
                        {project.repo_name}
                      </span>
                    )}
                    {project.local_path && (
                      <span className="truncate max-w-[200px]">
                        {project.local_path}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
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

function ImportDialog({ onDone }: { onDone: () => void }) {
  const { data: discovered, isLoading, error } = useClaudeCodeProjects();
  const importMutation = useImportClaudeCodeProjects();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const available = discovered?.filter((p) => !p.isImported) ?? [];
  const imported = discovered?.filter((p) => p.isImported) ?? [];

  function togglePath(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
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
    onDone();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Import from Claude Code</DialogTitle>
        <DialogDescription>
          Select projects discovered from your Claude Code sessions to import.
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto min-h-0 -mx-6 px-6">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">
              Scanning Claude Code projects...
            </span>
          </div>
        )}

        {error && (
          <div className="text-sm text-destructive py-4">
            Failed to scan: {error.message}
          </div>
        )}

        {!isLoading && discovered?.length === 0 && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No Claude Code projects found. Use Claude Code in a project
            directory to get started.
          </div>
        )}

        {available.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">
                Available ({available.length})
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={selectAll}
              >
                Select all
              </Button>
            </div>
            {available.map((project) => (
              <label
                key={project.path}
                className="flex items-start gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/50 transition-colors"
              >
                <Checkbox
                  checked={selected.has(project.path)}
                  onCheckedChange={() => togglePath(project.path)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
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
        )}

        {imported.length > 0 && (
          <div className="mt-4 space-y-1">
            <span className="text-sm font-medium text-muted-foreground">
              Already imported ({imported.length})
            </span>
            {imported.map((project) => (
              <div
                key={project.path}
                className="flex items-start gap-3 rounded-md border p-3 opacity-50"
              >
                <Checkbox checked disabled className="mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{project.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {project.path}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          onClick={handleImport}
          disabled={selected.size === 0 || importMutation.isPending}
        >
          {importMutation.isPending && (
            <Loader2 className="size-4 mr-2 animate-spin" />
          )}
          Import {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </DialogFooter>
    </>
  );
}

function deriveProjectNameFromPath(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, "");
  if (!normalized) return "";
  const parts = normalized.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}
