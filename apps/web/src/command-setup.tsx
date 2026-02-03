import { useState, useEffect, useMemo } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { createCommandRegistry } from "@kombuse/core";
import { CommandProvider } from "@kombuse/ui/providers";
import { CommandPalette } from "@kombuse/ui/components";
import { ticketsApi } from "@kombuse/ui/lib/api";
import type { CommandContext } from "@kombuse/types";

interface CommandSetupProps {
  children: React.ReactNode;
}

export function CommandSetup({ children }: CommandSetupProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { setTheme, resolvedTheme } = useTheme();
  const queryClient = useQueryClient();

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
        handler: async () => {
          const date = new Date().toISOString().split("T")[0];
          await ticketsApi.create({
            title: `New ticket ${date}`,
            project_id: "1", // TODO: Get from current route context
            author_id: "user-1", // TODO: Get from auth context
          });
          queryClient.invalidateQueries({ queryKey: ["tickets"] });
        },
      }),
    ];

    return () => unregisterFns.forEach((fn) => fn());
  }, [registry, setTheme, resolvedTheme, queryClient]);

  const context: CommandContext = {
    view: "home",
  };

  return (
    <CommandProvider registry={registry} context={context}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </CommandProvider>
  );
}
