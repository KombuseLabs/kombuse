import { Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@kombuse/ui/providers";
import { Header } from "@kombuse/ui/components";
import { CommandSetup } from "./command-setup";
import { Home } from "./routes/home";
import { Chats } from "./routes/chats";
import { Tickets } from "./routes/tickets";

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <CommandSetup>
          <div className="min-h-screen">
            <Header />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/chats" element={<Chats />} />
              <Route path="/tickets" element={<Tickets />} />
            </Routes>
          </div>
        </CommandSetup>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
