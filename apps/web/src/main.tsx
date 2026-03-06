import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./globals.css";
import { AppWithErrorBoundary } from "./app";

Sentry.init({
  dsn: "https://5812d23da71018e134e320af2e175115@o4510997023555584.ingest.us.sentry.io/4510997025193984",
  release: __SENTRY_RELEASE__ ?? undefined,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.captureConsoleIntegration({ levels: ["warn", "error"] }),
  ],
  tracesSampleRate: 0.1,
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppWithErrorBoundary />
    </BrowserRouter>
  </StrictMode>
);
