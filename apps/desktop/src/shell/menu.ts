import { app, Menu, shell, BrowserWindow } from "electron";
import type { MenuItemConstructorOptions } from "electron";

export interface MenuConfig {
  createWindow: (path?: string) => void;
  webUrl: string;
  serverPort: number;
  isDev: boolean;
}

interface RecentProject {
  id: string;
  name: string;
}

let currentConfig: MenuConfig | null = null;

async function fetchRecentProjects(
  serverPort: number
): Promise<RecentProject[]> {
  try {
    const response = await fetch(
      `http://localhost:${serverPort}/api/projects?limit=10`
    );
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

export function buildAppMenu(
  config: MenuConfig,
  recentProjects?: RecentProject[]
): void {
  currentConfig = config;

  const isMac = process.platform === "darwin";

  const openRecentSubmenu: MenuItemConstructorOptions[] =
    recentProjects && recentProjects.length > 0
      ? recentProjects.map((project) => ({
          label: project.name,
          click: () => config.createWindow(`/projects/${project.id}/tickets`),
        }))
      : [{ label: "No Recent Projects", enabled: false }];

  const appMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      {
        label: "Check for Updates...",
        click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) win.webContents.send("app:check-for-updates");
        },
      },
      { type: "separator" },
      {
        label: "Settings...",
        accelerator: "CmdOrCtrl+,",
        click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            win.webContents.loadURL(`${config.webUrl}/profile`);
          }
        },
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      {
        label: "New Window",
        accelerator: "CmdOrCtrl+N",
        click: () => config.createWindow(),
      },
      { type: "separator" },
      {
        label: "Open Recent",
        submenu: openRecentSubmenu,
      },
      { type: "separator" },
      { role: "close" },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
      { type: "separator" },
      {
        label: "Find",
        accelerator: "CmdOrCtrl+F",
        click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) {
            win.webContents.send("find:toggle");
          }
        },
      },
    ],
  };

  const viewSubmenu: MenuItemConstructorOptions[] = [
    { role: "reload" as const },
    { role: "forceReload" as const },
    { role: "toggleDevTools" as const },
    { type: "separator" as const },
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];

  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: viewSubmenu,
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    role: "windowMenu",
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [
      {
        label: "Check for Updates...",
        click: () => {
          const win = BrowserWindow.getFocusedWindow();
          if (win) win.webContents.send("app:check-for-updates");
        },
      },
      { type: "separator" },
      {
        label: "Learn More",
        click: () => shell.openExternal("https://kombuse.dev"),
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [appMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

export async function refreshMenu(): Promise<void> {
  if (!currentConfig) return;
  const projects = await fetchRecentProjects(currentConfig.serverPort);
  buildAppMenu(currentConfig, projects);
}
