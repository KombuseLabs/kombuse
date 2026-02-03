import { Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider, MutationCache } from "@tanstack/react-query";
import { AppProvider, ThemeProvider } from "@kombuse/ui/providers";
import { Header, UpdateNotification } from "@kombuse/ui/components";
import { Toaster, toast } from "@kombuse/ui/base";
import { CommandSetup } from "./command-setup";
import { Home } from "./routes/home";
import { Chats } from "./routes/chats";
import { Projects } from "./routes/projects";
import { Tickets } from "./routes/tickets";
import { Agents } from "./routes/agents";

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      toast.error(error.message || "An error occurred");
    },
  }),
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <AppProvider>
          <CommandSetup>
          <div className="min-h-screen">
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/chats" element={<Chats />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:projectId/tickets" element={<Tickets />} />
              <Route path="/projects/:projectId/tickets/:ticketId" element={<Tickets />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agents/:agentId" element={<Agents />} />
            </Routes>
          </div>
        </CommandSetup>
        </AppProvider>
        <Toaster />
        <UpdateNotification />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
