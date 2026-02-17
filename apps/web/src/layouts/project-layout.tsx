import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Sidebar, SidebarItem, BackendStatusIndicator } from "@kombuse/ui/components";
import { useProject, useProfileSetting, useAppContext } from "@kombuse/ui/hooks";
import { Ticket, Bot, MessageSquare, History, Tags, Shield, Database, Puzzle } from "lucide-react";

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  useProject(projectId ?? "");

  const { setCurrentProjectId } = useAppContext();
  useEffect(() => {
    setCurrentProjectId(projectId ?? null);
    return () => setCurrentProjectId(null);
  }, [projectId, setCurrentProjectId]);

  const { data: eventsSetting } = useProfileSetting("user-1", "sidebar.hidden.events");
  const { data: permissionsSetting } = useProfileSetting("user-1", "sidebar.hidden.permissions");
  const { data: databaseSetting } = useProfileSetting("user-1", "sidebar.hidden.database");
  const { data: pluginsSetting } = useProfileSetting("user-1", "sidebar.hidden.plugins");
  const showEvents = eventsSetting?.setting_value === "false";
  const showPermissions = permissionsSetting?.setting_value === "false";
  const showDatabase = databaseSetting?.setting_value === "false";
  const showPlugins = pluginsSetting?.setting_value === "false";

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar variant="rail" footer={<BackendStatusIndicator />}>
        <SidebarItem
          icon={<Ticket className="size-4" />}
          label="Tickets"
          to={`/projects/${projectId}/tickets`}
          variant="rail"
        />
        <SidebarItem
          icon={<MessageSquare className="size-4" />}
          label="Chats"
          to={`/projects/${projectId}/chats`}
          variant="rail"
        />
        <SidebarItem
          icon={<Bot className="size-4" />}
          label="Agents"
          to={`/projects/${projectId}/agents`}
          variant="rail"
        />
        <SidebarItem
          icon={<Tags className="size-4" />}
          label="Labels"
          to={`/projects/${projectId}/labels`}
          variant="rail"
        />
        {showEvents && (
          <SidebarItem
            icon={<History className="size-4" />}
            label="Events"
            to={`/projects/${projectId}/events`}
            variant="rail"
          />
        )}
        {showPermissions && (
          <SidebarItem
            icon={<Shield className="size-4" />}
            label="Permissions"
            to={`/projects/${projectId}/permissions`}
            variant="rail"
          />
        )}
        {showDatabase && (
          <SidebarItem
            icon={<Database className="size-4" />}
            label="Database"
            to={`/projects/${projectId}/database`}
            variant="rail"
          />
        )}
        {showPlugins && (
          <SidebarItem
            icon={<Puzzle className="size-4" />}
            label="Plugins"
            to={`/projects/${projectId}/plugins`}
            variant="rail"
          />
        )}
      </Sidebar>

      <main className="flex-1 min-h-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
