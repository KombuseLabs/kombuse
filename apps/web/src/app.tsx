import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { AppProvider, ThemeProvider, WebSocketProvider } from "@kombuse/ui/providers";
import { Header, UpdateNotification, NotificationBell, ProfileButton, CommandPalette, ActiveAgentsIndicator, BackendStatusBanner } from "@kombuse/ui/components";
import { Toaster, toast } from "@kombuse/ui/base";
import { getWsUrl } from "@kombuse/ui/lib/api";
import { useDesktop } from "@kombuse/ui/hooks";
import { CommandSetup, usePalette } from "./command-setup";
import { useHistoryNavigationContext } from "./hooks/use-history-navigation";
import { useSyncDefaultBackend } from "./hooks/use-sync-default-backend";
import { Home } from "./routes/home";
import { Chats } from "./routes/chats";
import { Tickets } from "./routes/tickets";
import { Agents } from "./routes/agents";
import { Events } from "./routes/events";
import { Labels } from "./routes/labels";
import { Permissions } from "./routes/permissions";
import { DatabasePage } from "./routes/database";
import { PluginsPage } from "./routes/plugins";
import { ClaudeCodeSessionViewer } from "./routes/claude-code-session";
import { Profile } from "./routes/profile";
import { Settings } from "./routes/settings";
import { ProjectLayout } from "./layouts/project-layout";
import { useScrollbarActivity } from "./hooks/use-scrollbar-activity";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(error.message || "An error occurred");
    },
  }),
});

function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { open, setOpen } = usePalette();
  const { isDesktop } = useDesktop();
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNavigationContext();
  const isHome = location.pathname === "/";
  useScrollbarActivity();
  useSyncDefaultBackend();

  return (
    <div
      className="h-dvh flex flex-col overflow-hidden"
      style={isDesktop ? { "--header-height": "2.5rem" } as React.CSSProperties : undefined}
    >
      {!isHome ? (
        <Header
          onNavigateHome={() => navigate("/")}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={goBack}
          onGoForward={goForward}
          center={
            <CommandPalette open={open} onOpenChange={setOpen} onNavigate={navigate} />
          }
        >
          <ActiveAgentsIndicator onNavigate={navigate} />
          <NotificationBell onNavigate={navigate} />
          <ProfileButton onNavigate={navigate} />
        </Header>
      ) : isDesktop ? (
        <div className="electron-drag h-10 absolute inset-x-0 top-0 z-50" />
      ) : null}
      <BackendStatusBanner />
      <div className="flex-1 min-h-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          {/* Project routes with sidebar */}
          <Route path="/projects/:projectId" element={<ProjectLayout />}>
            <Route path="tickets" element={<Tickets />} />
            <Route path="tickets/:ticketId" element={<Tickets />} />
            <Route path="chats" element={<Chats />} />
            <Route path="chats/:sessionId" element={<Chats />} />
            <Route path="agents" element={<Agents />} />
            <Route path="agents/:agentId" element={<Agents />} />
            <Route path="labels" element={<Labels />} />
            <Route path="labels/:labelId" element={<Labels />} />
            <Route path="events" element={<Events />} />
            <Route path="permissions" element={<Permissions />} />
            <Route path="database" element={<DatabasePage />} />
            <Route path="plugins" element={<PluginsPage />} />
          </Route>

          {/* Global agents (outside project context) */}
          <Route path="/agents" element={<Agents />} />
          <Route path="/agents/:agentId" element={<Agents />} />

          {/* Claude Code session viewer */}
          <Route path="/claude-code" element={<ClaudeCodeSessionViewer />} />
          <Route path="/claude-code/:projectPath" element={<ClaudeCodeSessionViewer />} />
          <Route path="/claude-code/:projectPath/sessions/:sessionId" element={<ClaudeCodeSessionViewer />} />
        </Routes>
      </div>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <WebSocketProvider url={getWsUrl()}>
          <AppProvider>
            <CommandSetup>
              <AppContent />
            </CommandSetup>
          </AppProvider>
          <Toaster />
          <UpdateNotification />
        </WebSocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
