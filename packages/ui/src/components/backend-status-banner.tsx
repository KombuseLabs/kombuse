"use client";

import {
  useBackendStatus,
  useRefreshBackendStatus,
} from "../hooks/use-backend-status";
import { Button } from "../base/button";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

function BackendStatusBanner() {
  const { data: statuses, isLoading } = useBackendStatus();
  const refreshMutation = useRefreshBackendStatus();

  if (isLoading || !statuses) return null;

  const available = statuses.filter((s) => s.available);
  if (available.length > 0) return null;

  return (
    <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">No agent backends found</p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
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
    </div>
  );
}

export { BackendStatusBanner };
