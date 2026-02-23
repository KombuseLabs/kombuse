import { useEffect } from "react";
import { Outlet, useParams } from "react-router-dom";
import { Sidebar, SidebarItem, BottomNav } from "@kombuse/ui/components";
import { useProject, useProfileSetting, useAppContext, useIsMobile } from "@kombuse/ui/hooks";
import { Ticket, Bot, MessageSquare, History, Tags, Shield, Database, Puzzle, BarChart3 } from "lucide-react";

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project } = useProject(projectId ?? "");
  const isMobile = useIsMobile();

  const { setCurrentProjectId } = useAppContext();
  useEffect(() => {
    setCurrentProjectId(project?.id ?? null);
    return () => setCurrentProjectId(null);
  }, [project?.id, setCurrentProjectId]);

  const { data: eventsSetting } = useProfileSetting("user-1", "sidebar.hidden.events");
  const { data: permissionsSetting } = useProfileSetting("user-1", "sidebar.hidden.permissions");
  const { data: databaseSetting } = useProfileSetting("user-1", "sidebar.hidden.database");
  const { data: pluginsSetting } = useProfileSetting("user-1", "sidebar.hidden.plugins");
  const { data: analyticsSetting } = useProfileSetting("user-1", "sidebar.hidden.analytics");
  const showEvents = eventsSetting?.setting_value === "false";
  const showPermissions = permissionsSetting?.setting_value === "false";
  const showDatabase = databaseSetting?.setting_value === "false";
  const showPlugins = pluginsSetting?.setting_value === "false";
  const showAnalytics = analyticsSetting?.setting_value === "false";

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <main className="flex-1 min-h-0 overflow-y-auto">
          <Outlet />
        </main>
        <BottomNav projectId={projectId} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <Sidebar variant="rail">
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
        {showAnalytics && (
          <SidebarItem
            icon={<BarChart3 className="size-4" />}
            label="Analytics"
            to={`/projects/${projectId}/analytics`}
            variant="rail"
          />
        )}
      </Sidebar>

      <main className="flex-1 min-h-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
