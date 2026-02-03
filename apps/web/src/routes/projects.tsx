import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@kombuse/ui/base";
import { Folder } from "lucide-react";
import type { Project } from "@kombuse/types";

// Mock projects - replace with useProjects() hook when backend is ready
const mockProjects: Project[] = [
  {
    id: "1",
    name: "Kombuse Core",
    description: "Core platform services and infrastructure",
    owner_id: "user-1",
    local_path: null,
    repo_source: "github",
    repo_owner: "kombuse",
    repo_name: "kombuse-core",
    created_at: "2024-01-15T10:00:00Z",
    updated_at: "2024-01-20T15:30:00Z",
  },
  {
    id: "2",
    name: "Kombuse Web",
    description: "Web application and frontend components",
    owner_id: "user-1",
    local_path: null,
    repo_source: "github",
    repo_owner: "kombuse",
    repo_name: "kombuse-web",
    created_at: "2024-01-16T10:00:00Z",
    updated_at: "2024-01-21T11:00:00Z",
  },
  {
    id: "3",
    name: "Kombuse API",
    description: "REST API and backend services",
    owner_id: "user-1",
    local_path: null,
    repo_source: "github",
    repo_owner: "kombuse",
    repo_name: "kombuse-api",
    created_at: "2024-01-17T10:00:00Z",
    updated_at: "2024-01-22T09:15:00Z",
  },
];

export function Projects() {
  const projects = mockProjects;

  return (
    <main className="flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Projects</h1>
      </div>

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
    </main>
  );
}
