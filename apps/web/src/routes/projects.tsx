import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@kombuse/ui/base";
import { Folder, Loader2 } from "lucide-react";
import { useProjects } from "@kombuse/ui/hooks";

export function Projects() {
  const { data: projects, isLoading, error } = useProjects();

  return (
    <main className="flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Projects</h1>
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
          No projects yet.
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
