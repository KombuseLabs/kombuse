"use client";

import { useState } from "react";
import { BACKEND_TYPES } from "@kombuse/types";
import { backendLabel } from "../lib/backend-utils";
import {
  useBackendStatus,
  useRefreshBackendStatus,
} from "../hooks/use-backend-status";
import { Button } from "../base/button";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { cn } from "../lib/utils";

function getInstallCommand(backendType: string): string {
  if (backendType === BACKEND_TYPES.CLAUDE_CODE) {
    return "npm install -g @anthropic-ai/claude-code";
  }
  if (backendType === BACKEND_TYPES.CODEX) {
    return "npm install -g @openai/codex";
  }
  return "";
}

function BackendStatusBanner() {
  const { data: statuses, isLoading } = useBackendStatus();
  const refreshMutation = useRefreshBackendStatus();
  const [dismissed, setDismissed] = useState(false);

  if (isLoading || !statuses || dismissed) return null;

  const unavailable = statuses.filter((s) => !s.available);
  if (unavailable.length === 0) return null;

  return (
    <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {unavailable.length === statuses.length
            ? "No agent backends found"
            : `${unavailable.map((s) => backendLabel(s.backendType)).join(" and ")} not found`}
        </p>
        <div className="mt-1 space-y-0.5">
          {unavailable.map((status) => (
            <p key={status.backendType} className="text-xs opacity-80">
              {backendLabel(status.backendType)}:{" "}
              <code className="rounded bg-amber-100 px-1 py-0.5 text-[11px] dark:bg-amber-900/50">
                {getInstallCommand(status.backendType)}
              </code>
            </p>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw
            className={cn(
              "mr-1 size-3",
              refreshMutation.isPending && "animate-spin"
            )}
          />
          Check Again
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
          onClick={() => setDismissed(true)}
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export { BackendStatusBanner };
