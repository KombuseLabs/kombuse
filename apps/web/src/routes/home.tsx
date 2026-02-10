import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, CardContent, Checkbox } from "@kombuse/ui/base";
import { ArrowRight, Folder, FolderOpen, Loader2 } from "lucide-react";
import {
  useProjects,
  useClaudeCodeProjects,
  useImportClaudeCodeProjects,
} from "@kombuse/ui/hooks";

export function Home() {
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const { data: discovered, isLoading: scanLoading } = useClaudeCodeProjects();
  const importMutation = useImportClaudeCodeProjects();
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    <main className="flex flex-col items-center min-h-screen">
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
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-4">
              Your Projects
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {projects.map((project) => (
                <Link key={project.id} to={`/projects/${project.id}/tickets`}>
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
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={selectAll}
              >
                Select all
              </Button>
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
            <div className="flex justify-end px-4 py-3 border-t border-border/40">
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
            <p className="text-sm text-muted-foreground">
              No projects discovered. Use Claude Code in a project directory to
              get started.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
