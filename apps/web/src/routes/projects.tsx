import { useState } from "react";
import { Link } from "react-router-dom";
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
  DialogTitle,
  DialogTrigger,
} from "@kombuse/ui/base";
import { Download, Folder, Loader2 } from "lucide-react";
import {
  useProjects,
  useClaudeCodeProjects,
  useImportClaudeCodeProjects,
} from "@kombuse/ui/hooks";

export function Projects() {
  const { data: projects, isLoading, error } = useProjects();
  const [importOpen, setImportOpen] = useState(false);

  return (
    <main className="flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Projects</h1>
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
          No projects yet. Import projects from Claude Code to get started.
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
