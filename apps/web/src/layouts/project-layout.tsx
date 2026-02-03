import { useState, useEffect } from "react";
import { Outlet, useParams, Link } from "react-router-dom";
import { Sidebar, SidebarItem } from "@kombuse/ui/components";
import { Ticket, Bot, Folder } from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <Sidebar
        isCollapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
        header={
          <Link
            to="/projects"
            className="flex items-center gap-2 hover:text-foreground/80"
          >
            <Folder className="size-4 shrink-0" />
            <span className="truncate">{projectId}</span>
          </Link>
        }
      >
        <SidebarItem
          icon={<Ticket className="size-4" />}
          label="Tickets"
          to={`/projects/${projectId}/tickets`}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Bot className="size-4" />}
          label="Agents"
          to={`/projects/${projectId}/agents`}
          isCollapsed={isCollapsed}
        />
      </Sidebar>

      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
