"use client";

import { useState } from "react";
import {
  useBackendStatus,
  useRefreshBackendStatus,
} from "../hooks/use-backend-status";
import { Button } from "../base/button";
import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { backendLabel } from "../lib/backend-utils";
import { cn } from "../lib/utils";

function BackendStatusBanner() {
  const { data: statuses, isLoading } = useBackendStatus();
  const refreshMutation = useRefreshBackendStatus();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("kombuse:backend-version-warning-dismissed") ===
      "true"
    );
  });

  if (isLoading || !statuses) return null;

  const available = statuses.filter((s) => s.available);
  if (available.length === 0) return null;

  const belowMinimum = statuses.filter((s) => s.available && !s.meetsMinimum);
  const belowNodeMinimum = statuses.filter(
    (s) => s.available && !s.meetsNodeMinimum
  );
  if (belowMinimum.length === 0 && belowNodeMinimum.length === 0) return null;
  if (dismissed) return null;

  const warnings: string[] = [];
  if (belowMinimum.length > 0) {
    warnings.push(
      belowMinimum
        .map(
          (s) =>
            `${backendLabel(s.backendType)} ${s.version ?? "unknown"} is below minimum ${s.minimumVersion}`
        )
        .join(". ") + ". Please update for best results."
    );
  }
  if (belowNodeMinimum.length > 0) {
    warnings.push(
      belowNodeMinimum
        .map(
          (s) =>
            `Node.js ${s.nodeVersion ?? "unknown"} is below minimum ${s.minimumNodeVersion} required by ${backendLabel(s.backendType)}`
        )
        .join(". ") + ". Please update Node.js."
    );
  }

  return (
    <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Backend version warning</p>
        {warnings.map((w, i) => (
          <p key={i} className="text-xs opacity-80">
            {w}
          </p>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 shrink-0 text-xs text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
        onClick={() => {
          localStorage.removeItem(
            "kombuse:backend-version-warning-dismissed"
          );
          setDismissed(false);
          refreshMutation.mutate();
        }}
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
        className="size-7 shrink-0 text-amber-900 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-200 dark:hover:bg-amber-900/40"
        onClick={() => {
          localStorage.setItem(
            "kombuse:backend-version-warning-dismissed",
            "true"
          );
          setDismissed(true);
        }}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}

export { BackendStatusBanner };
