import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import * as Sentry from "@sentry/react";
import "./globals.css";
import { AppWithErrorBoundary } from "./app";
import { profileSettingsApi } from "@kombuse/ui/lib/api";
import { isSentryEnabled, setSentryEnabled } from "./sentry-gate";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    release: __SENTRY_RELEASE__ ?? undefined,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.captureConsoleIntegration({ levels: ["warn", "error"] }),
    ],
    tracesSampleRate: 0.1,
    beforeSend: (event) => isSentryEnabled() ? event : null,
    beforeSendTransaction: (event) => isSentryEnabled() ? event : null,
  });

  profileSettingsApi.get("user-1", "telemetry.crash_reporting_enabled")
    .then((setting) => {
      if (setting?.setting_value === "false") {
        setSentryEnabled(false);
      }
    })
    .catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AppWithErrorBoundary />
    </BrowserRouter>
  </StrictMode>
);
