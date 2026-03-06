"use client";

import { BACKEND_TYPES } from "@kombuse/types";
import { AlertTriangle, RefreshCw, Terminal } from "lucide-react";
import { Button } from "../base/button";
import {
  useBackendStatus,
  useRefreshBackendStatus,
} from "../hooks/use-backend-status";
import { backendLabel, getInstallCommand } from "../lib/backend-utils";
import { cn } from "../lib/utils";

const USER_FACING_BACKENDS = [BACKEND_TYPES.CLAUDE_CODE, BACKEND_TYPES.CODEX];

function NoBackendScreen() {
  const { data: statuses } = useBackendStatus();
  const refreshMutation = useRefreshBackendStatus();

  const unavailable = statuses
    ? statuses.filter((s) => !s.available)
    : USER_FACING_BACKENDS.map((bt) => ({
        backendType: bt,
        available: false as const,
        version: null,
        path: null,
        meetsMinimum: false,
        minimumVersion: null,
        nodeVersion: null,
        meetsNodeMinimum: true,
        minimumNodeVersion: null,
      }));

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950/50">
          <AlertTriangle className="size-8 text-amber-600 dark:text-amber-400" />
        </div>

        <h2 className="mb-2 text-xl font-semibold">
          No agent backends found
        </h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Kombuse requires at least one CLI backend to function. Install one of
          the following to get started:
        </p>

        <div className="mb-6 space-y-3 text-left">
          {unavailable.map((status) => (
            <div
              key={status.backendType}
              className="rounded-lg border border-border/60 p-3"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Terminal className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {backendLabel(status.backendType)}
                </span>
              </div>
              <code className="block rounded bg-muted px-3 py-2 text-xs font-mono">
                {getInstallCommand(status.backendType)}
              </code>
              {status.minimumVersion && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Minimum required version: {status.minimumVersion}
                </p>
              )}
            </div>
          ))}
        </div>

        <Button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
        >
          <RefreshCw
            className={cn(
              "mr-2 size-4",
              refreshMutation.isPending && "animate-spin",
            )}
          />
          Check Again
        </Button>
      </div>
    </div>
  );
}

export { NoBackendScreen };
