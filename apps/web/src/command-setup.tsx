import { useState, useEffect, useMemo, createContext, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { createCommandRegistry } from "@kombuse/core";
import { CommandProvider } from "@kombuse/ui/providers";
import { useAppContext } from "@kombuse/ui/hooks";
import type { CommandContext } from "@kombuse/types";

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
          navigate("/projects");
        },
      }),
      registry.register({
        id: "projects.create",
        title: "Create New Project",
        category: "Projects",
        handler: () => {
          navigate("/projects/new");
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
    ];

    return () => unregisterFns.forEach((fn) => fn());
  }, [registry, setTheme, resolvedTheme, navigate, currentProjectId]);

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
        {children}
      </PaletteCtx.Provider>
    </CommandProvider>
  );
}
