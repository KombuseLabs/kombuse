"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../base/button";
import { TooltipProvider } from "../../base/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  header?: React.ReactNode;
}

function Sidebar({
  children,
  className,
  isCollapsed = false,
  onCollapsedChange,
  header,
}: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-background transition-all duration-200",
          isCollapsed ? "w-16" : "w-60",
          className
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-3">
          {!isCollapsed && (
            <div className="flex-1 truncate text-sm font-medium">{header}</div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapsedChange?.(!isCollapsed)}
            className="size-8 shrink-0"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 p-2">{children}</nav>
      </aside>
    </TooltipProvider>
  );
}

export { Sidebar };
export type { SidebarProps };
