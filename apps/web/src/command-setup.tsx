import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import { createCommandRegistry } from "@kombuse/core";
import { CommandProvider } from "@kombuse/ui/providers";
import { CommandPalette } from "@kombuse/ui/components";
import { useAppContext } from "@kombuse/ui/hooks";
import type { CommandContext } from "@kombuse/types";

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
        handler: () => setPaletteOpen(true),
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

  return (
    <CommandProvider registry={registry} context={context}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={navigate} />
    </CommandProvider>
  );
}
