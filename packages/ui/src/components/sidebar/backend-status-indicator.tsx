"use client";

import type { BackendStatus } from "@kombuse/types";
import { backendLabel } from "../../lib/backend-utils";
import {
  useBackendStatus,
  useRefreshBackendStatus,
} from "../../hooks/use-backend-status";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../base/popover";
import { Button } from "../../base/button";
import { RefreshCw } from "lucide-react";
import { cn } from "../../lib/utils";

function statusDotColor(status: BackendStatus): string {
  return status.available ? "bg-green-500" : "bg-amber-500";
}

function BackendStatusIndicator() {
  const { data: statuses, isLoading } = useBackendStatus();
  const refreshMutation = useRefreshBackendStatus();

  if (isLoading || !statuses) return null;

  const hasUnavailable = statuses.some((s) => !s.available);
  const firstVersion = statuses.find((s) => s.available && s.version);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex flex-col items-center gap-1 rounded-lg p-1.5 transition-colors hover:bg-muted/50"
          aria-label="Backend status"
        >
          <div className="flex items-center gap-1">
            {statuses.map((status) => (
              <span
                key={status.backendType}
                className={cn("size-2 rounded-full", statusDotColor(status))}
              />
            ))}
          </div>
          {firstVersion && (
            <span className="text-[10px] leading-tight text-muted-foreground">
              v{firstVersion.version}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-64 p-0">
        <div className="border-b px-3 py-2">
          <h4 className="text-sm font-medium">Backend Status</h4>
        </div>
        <div className="space-y-2 p-3">
          {statuses.map((status) => (
            <div key={status.backendType} className="flex items-center gap-2">
              <span
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  statusDotColor(status)
                )}
              />
              <span className="text-sm font-medium">
                {backendLabel(status.backendType)}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {status.available
                  ? status.version ?? "installed"
                  : "not found"}
              </span>
            </div>
          ))}
        </div>
        {hasUnavailable && (
          <div className="border-t px-3 py-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
            >
              <RefreshCw
                className={cn(
                  "mr-1.5 size-3",
                  refreshMutation.isPending && "animate-spin"
                )}
              />
              Check Again
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export { BackendStatusIndicator };
