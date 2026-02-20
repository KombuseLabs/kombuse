import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { createCommandRegistry } from "@kombuse/core";
import { toast } from "@kombuse/ui/base";
import { CommandProvider } from "@kombuse/ui/providers";
import {
  useAppContext,
  useCodexMcpStatus,
  useProfileSetting,
  useSetCodexMcpEnabled,
  useUpsertProfileSetting,
} from "@kombuse/ui/hooks";
import type { CommandContext } from "@kombuse/types";
import { useHistoryNavigation, HistoryNavigationContext } from "./hooks/use-history-navigation";

const USER_PROFILE_ID = "user-1";
const SIDEBAR_EVENTS_SETTING_KEY = "sidebar.hidden.events";
const SIDEBAR_PERMISSIONS_SETTING_KEY = "sidebar.hidden.permissions";
const SIDEBAR_DATABASE_SETTING_KEY = "sidebar.hidden.database";
const SIDEBAR_PLUGINS_SETTING_KEY = "sidebar.hidden.plugins";

interface PaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const PaletteCtx = createContext<PaletteState>({ open: false, setOpen: () => {} });

export function usePalette() {
  return useContext(PaletteCtx);
}

interface CommandSetupProps {
  children: React.ReactNode;
}

export function CommandSetup({ children }: CommandSetupProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const navigate = useNavigate();
  const { setTheme, resolvedTheme } = useTheme();
  const { currentTicket, currentSession, isGenerating, view, currentProjectId } =
    useAppContext();

  const registry = useMemo(() => createCommandRegistry(), []);
  const historyNav = useHistoryNavigation();

  const { data: eventsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_EVENTS_SETTING_KEY);
  const { data: permissionsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_PERMISSIONS_SETTING_KEY);
  const { data: databaseSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_DATABASE_SETTING_KEY);
  const { data: codexMcpStatus } = useCodexMcpStatus();
  const eventsVisible = eventsSetting?.setting_value === "false";
  const permissionsVisible = permissionsSetting?.setting_value === "false";
  const databaseVisible = databaseSetting?.setting_value === "false";
  const { data: pluginsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_PLUGINS_SETTING_KEY);
  const pluginsVisible = pluginsSetting?.setting_value === "false";
  const codexMcpEnabled = codexMcpStatus?.enabled === true;
  const setCodexMcpEnabled = useSetCodexMcpEnabled();
  const upsertSetting = useUpsertProfileSetting();

  // Register commands
  useEffect(() => {
    const unregisterFns = [
      registry.register({
        id: "palette.open",
        title: "Open Command Palette",
        category: "General",
        keybinding: "mod+k",
        handler: () => setPaletteOpen((prev) => !prev),
      }),
      registry.register({
        id: "theme.toggle",
        title: "Toggle Dark Mode",
        category: "General",
        keybinding: "mod+shift+d",
        handler: () => setTheme(resolvedTheme === "dark" ? "light" : "dark"),
      }),
      registry.register({
        id: "theme.light",
        title: "Switch to Light Mode",
        category: "Theme",
        handler: () => setTheme("light"),
      }),
      registry.register({
        id: "theme.dark",
        title: "Switch to Dark Mode",
        category: "Theme",
        handler: () => setTheme("dark"),
      }),
      registry.register({
        id: "theme.system",
        title: "Use System Theme",
        category: "Theme",
        handler: () => setTheme("system"),
      }),
      registry.register({
        id: "tickets.create",
        title: "Create New Ticket",
        category: "Tickets",
        keybinding: "mod+shift+t",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}/tickets/new`);
        },
      }),
      registry.register({
        id: "projects.browse",
        title: "Browse Projects",
        category: "Projects",
        icon: "Folder",
        handler: () => {
          navigate("/");
        },
      }),
      registry.register({
        id: "projects.create",
        title: "Create New Project",
        category: "Projects",
        handler: () => {
          navigate("/?create=true");
        },
      }),
      registry.register({
        id: "profile.view",
        title: "View Profile",
        category: "General",
        handler: () => {
          navigate("/profile");
        },
      }),
      registry.register({
        id: "settings.open",
        title: "Open Settings",
        category: "General",
        keybinding: "mod+,",
        handler: () => {
          navigate("/settings");
        },
      }),
      registry.register({
        id: "sidebar.toggleEvents",
        title: eventsVisible ? "Hide Events in Sidebar" : "Show Events in Sidebar",
        category: "Sidebar",
        handler: () => {
          upsertSetting.mutate({
            profile_id: USER_PROFILE_ID,
            setting_key: SIDEBAR_EVENTS_SETTING_KEY,
            setting_value: eventsVisible ? "true" : "false",
          });
        },
      }),
      registry.register({
        id: "sidebar.togglePermissions",
        title: permissionsVisible ? "Hide Permissions in Sidebar" : "Show Permissions in Sidebar",
        category: "Sidebar",
        handler: () => {
          upsertSetting.mutate({
            profile_id: USER_PROFILE_ID,
            setting_key: SIDEBAR_PERMISSIONS_SETTING_KEY,
            setting_value: permissionsVisible ? "true" : "false",
          });
        },
      }),
      registry.register({
        id: "sidebar.toggleDatabase",
        title: databaseVisible ? "Hide Database in Sidebar" : "Show Database in Sidebar",
        category: "Sidebar",
        handler: () => {
          upsertSetting.mutate({
            profile_id: USER_PROFILE_ID,
            setting_key: SIDEBAR_DATABASE_SETTING_KEY,
            setting_value: databaseVisible ? "true" : "false",
          });
        },
      }),
      registry.register({
        id: "sidebar.togglePlugins",
        title: pluginsVisible ? "Hide Plugins in Sidebar" : "Show Plugins in Sidebar",
        category: "Sidebar",
        handler: () => {
          upsertSetting.mutate({
            profile_id: USER_PROFILE_ID,
            setting_key: SIDEBAR_PLUGINS_SETTING_KEY,
            setting_value: pluginsVisible ? "true" : "false",
          });
        },
      }),
      registry.register({
        id: "codex.toggleMcp",
        title: codexMcpEnabled ? "Disable MCP for Codex" : "Enable MCP for Codex",
        category: "Codex",
        handler: () => {
          setCodexMcpEnabled.mutate(!codexMcpEnabled, {
            onError: (error) => {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Failed to update Codex MCP setting"
              );
            },
          });
        },
      }),
      registry.register({
        id: "nav.events",
        title: "Go to Events",
        category: "Navigation",
        icon: "History",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}/events`);
        },
      }),
      registry.register({
        id: "nav.permissions",
        title: "Go to Permissions",
        category: "Navigation",
        icon: "Shield",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}/permissions`);
        },
      }),
      registry.register({
        id: "nav.database",
        title: "Go to Database",
        category: "Navigation",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}/database`);
        },
      }),
      registry.register({
        id: "nav.plugins",
        title: "Go to Plugins",
        category: "Navigation",
        icon: "Puzzle",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}/plugins`);
        },
      }),
      registry.register({
        id: "nav.projectSettings",
        title: "Go to Project Settings",
        category: "Navigation",
        icon: "Settings",
        when: (ctx) => ctx.currentProjectId != null,
        handler: () => {
          navigate(`/projects/${currentProjectId}`);
        },
      }),
      registry.register({
        id: "nav.back",
        title: "Go Back",
        category: "Navigation",
        icon: "ChevronLeft",
        keybinding: "mod+[",
        handler: () => historyNav.goBack(),
      }),
      registry.register({
        id: "nav.forward",
        title: "Go Forward",
        category: "Navigation",
        icon: "ChevronRight",
        keybinding: "mod+]",
        handler: () => historyNav.goForward(),
      }),
    ];

    return () => unregisterFns.forEach((fn) => fn());
  }, [registry, setTheme, resolvedTheme, navigate, currentProjectId, eventsVisible, permissionsVisible, databaseVisible, pluginsVisible, codexMcpEnabled, setCodexMcpEnabled, upsertSetting, historyNav.goBack, historyNav.goForward]);

  const context: CommandContext = useMemo(
    () => ({
      currentTicket: currentTicket
        ? { id: currentTicket.id, status: currentTicket.status }
        : null,
      currentSession,
      isGenerating,
      view,
      currentProjectId,
    }),
    [currentTicket, currentSession, isGenerating, view, currentProjectId]
  );

  const paletteState = useMemo(
    () => ({ open: paletteOpen, setOpen: setPaletteOpen }),
    [paletteOpen]
  );

  return (
    <CommandProvider registry={registry} context={context}>
      <PaletteCtx.Provider value={paletteState}>
        <HistoryNavigationContext.Provider value={historyNav}>
          {children}
        </HistoryNavigationContext.Provider>
      </PaletteCtx.Provider>
    </CommandProvider>
  );
}
