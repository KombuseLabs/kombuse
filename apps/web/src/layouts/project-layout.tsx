import { useState, useEffect } from "react";
import { Outlet, useParams, Link } from "react-router-dom";
import { Sidebar, SidebarItem } from "@kombuse/ui/components";
import { useProject, useProfileSetting, useAppContext } from "@kombuse/ui/hooks";
import { Ticket, Bot, Folder, MessageSquare, History, Tags, Shield, Database } from "lucide-react";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId ?? "");
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const stored = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return stored === "true";
  });

  const { setCurrentProjectId } = useAppContext();
  useEffect(() => {
    setCurrentProjectId(projectId ?? null);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  const { data: eventsSetting } = useProfileSetting("user-1", "sidebar.hidden.events");
  const { data: permissionsSetting } = useProfileSetting("user-1", "sidebar.hidden.permissions");
  const { data: databaseSetting } = useProfileSetting("user-1", "sidebar.hidden.database");
  const showEvents = eventsSetting?.setting_value === "false";
  const showPermissions = permissionsSetting?.setting_value === "false";
  const showDatabase = databaseSetting?.setting_value === "false";

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(isCollapsed));
  }, [isCollapsed]);

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-[calc(100dvh-var(--header-height))]">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))]">
      <Sidebar
        isCollapsed={isCollapsed}
        onCollapsedChange={setIsCollapsed}
        header={
          <Link
            to="/projects"
            className="flex items-center gap-2 hover:text-foreground/80"
          >
            <Folder className="size-4 shrink-0" />
            <span className="truncate">{project?.name ?? projectId}</span>
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
          icon={<MessageSquare className="size-4" />}
          label="Chats"
          to={`/projects/${projectId}/chats`}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Bot className="size-4" />}
          label="Agents"
          to={`/projects/${projectId}/agents`}
          isCollapsed={isCollapsed}
        />
        <SidebarItem
          icon={<Tags className="size-4" />}
          label="Labels"
          to={`/projects/${projectId}/labels`}
          isCollapsed={isCollapsed}
        />
        {showEvents && (
          <SidebarItem
            icon={<History className="size-4" />}
            label="Events"
            to={`/projects/${projectId}/events`}
            isCollapsed={isCollapsed}
          />
        )}
        {showPermissions && (
          <SidebarItem
            icon={<Shield className="size-4" />}
            label="Permissions"
            to={`/projects/${projectId}/permissions`}
            isCollapsed={isCollapsed}
          />
        )}
        {showDatabase && (
          <SidebarItem
            icon={<Database className="size-4" />}
            label="Database"
            to={`/projects/${projectId}/database`}
            isCollapsed={isCollapsed}
          />
        )}
      </Sidebar>

      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
