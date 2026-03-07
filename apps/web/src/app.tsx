import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache, QueryCache } from "@tanstack/react-query";
import * as Sentry from "@sentry/react";
import { createBrowserLogger } from "@kombuse/core/browser-logger";

const logger = createBrowserLogger("ReactQuery");
import { AppProvider, ThemeProvider, WebSocketProvider } from "@kombuse/ui/providers";
import { Header, UnifiedUpdateNotification, UpdateStatusDialog, NotificationBell, ProfileButton, CommandPalette, ActiveAgentsIndicator, BackendStatusBanner, NoBackendScreen, FindBar, LayoutToggle } from "@kombuse/ui/components";
import { Toaster, toast } from "@kombuse/ui/base";
import { getWsUrl } from "@kombuse/ui/lib/api";
import { useDesktop, useAvailableBackends } from "@kombuse/ui/hooks";
import { Loader2 } from "lucide-react";
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
import { Analytics } from "./routes/analytics";
import { ClaudeCodeSessionViewer } from "./routes/claude-code-session";
import { Profile } from "./routes/profile";
import { Settings } from "./routes/settings";
import { ProjectPage } from "./routes/project";
import { ProjectLayout } from "./layouts/project-layout";
import { useScrollbarActivity } from "./hooks/use-scrollbar-activity";

function extractProjectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/)
  return match?.[1] ?? null
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.meta?.silent) return;
      if (import.meta.env.DEV) {
        logger.warn(`Query failed: ${JSON.stringify(query.queryKey)}`, { error: error.message });
      }
      const msg =
        (query.meta?.errorMessage as string) ??
        `Failed to load data: ${error.message}`;
      toast.error(msg);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      Sentry.captureException(error);
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
  const { isLoading: backendsLoading, noneAvailable } = useAvailableBackends();

  return (
    <div
      className="h-dvh flex flex-col"
      style={isDesktop ? { "--header-height": "2.5rem" } as React.CSSProperties : undefined}
    >
      <FindBar />
      <Header
        onNavigateHome={isHome ? undefined : () => navigate("/")}
        minimal={isHome}
        afterTitle={!isHome ? <LayoutToggle /> : undefined}
        {...(!isHome && {
          canGoBack,
          canGoForward,
          onGoBack: goBack,
          onGoForward: goForward,
          center: <CommandPalette open={open} onOpenChange={setOpen} onNavigate={navigate} />,
        })}
      >
        {!isHome && (
          <>
            <ActiveAgentsIndicator onNavigate={navigate} />
            <NotificationBell onNavigate={navigate} />
            <ProfileButton onNavigate={navigate} />
          </>
        )}
      </Header>
      {noneAvailable ? (
        <>
          <BackendStatusBanner />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Routes>
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NoBackendScreen />} />
            </Routes>
          </div>
        </>
      ) : backendsLoading ? (
        <div className="flex flex-1 items-center justify-center min-h-0">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <BackendStatusBanner />
          <div className="flex-1 min-h-0 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              {/* Project routes with sidebar */}
              <Route path="/projects/:projectId" element={<ProjectLayout />}>
                <Route index element={<ProjectPage />} />
                <Route path="tickets" element={<Tickets />} />
                <Route path="tickets/:ticketNumber" element={<Tickets />} />
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
                <Route path="plugins/:pluginName" element={<PluginsPage />} />
                <Route path="analytics" element={<Analytics />} />
              </Route>

              {/* Claude Code session viewer */}
              <Route path="/claude-code" element={<ClaudeCodeSessionViewer />} />
              <Route path="/claude-code/:projectPath" element={<ClaudeCodeSessionViewer />} />
              <Route path="/claude-code/:projectPath/sessions/:sessionId" element={<ClaudeCodeSessionViewer />} />
            </Routes>
          </div>
        </>
      )}
    </div>
  );
}

function ErrorFallback() {
  return (
    <div className="flex h-dvh items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-muted-foreground">An unexpected error occurred. Please reload the page.</p>
        <button
          className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
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
          <AppProvider initialProjectId={extractProjectIdFromPath(window.location.pathname)}>
            <CommandSetup>
              <AppContent />
            </CommandSetup>
          </AppProvider>
          <Toaster />
          <UnifiedUpdateNotification />
          <UpdateStatusDialog />
        </WebSocketProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export const AppWithErrorBoundary = Sentry.withErrorBoundary(App, {
  fallback: <ErrorFallback />,
});
