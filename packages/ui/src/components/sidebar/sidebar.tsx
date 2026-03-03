"use client";

import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "../../base/button";
import { TooltipProvider } from "../../base/tooltip";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SidebarProps {
  children: React.ReactNode;
  className?: string;
  variant?: "panel" | "rail";
  isCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

function Sidebar({
  children,
  className,
  variant = "panel",
  isCollapsed = false,
  onCollapsedChange,
  header,
  footer,
}: SidebarProps) {
  if (variant === "rail") {
    return (
      <TooltipProvider delayDuration={0}>
        <aside
          className={cn("shrink-0 px-3 pt-3", className)}
          data-sidebar-variant={variant}
          data-testid="sidebar"
        >
          <div className="flex w-17 flex-col rounded-[1.5rem] border border-border/80 bg-background/95 p-2 shadow-sm">
            {header && (
              <div className="flex justify-center pb-4">
                {header}
              </div>
            )}
            <nav className="flex flex-col items-center gap-3 pb-1">
              {children}
            </nav>
            {footer && (
              <div className="mt-auto flex flex-col items-center border-t border-border/50 pt-2">
                {footer}
              </div>
            )}
          </div>
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-background transition-all duration-200",
          isCollapsed ? "w-16" : "w-60",
          className
        )}
        data-sidebar-variant={variant}
        data-testid="sidebar"
      >
        <div
          className={cn(
            "flex h-14 items-center border-b",
            isCollapsed ? "justify-center" : "justify-between px-3"
          )}
        >
          {!isCollapsed && (
            <div className="flex-1 truncate text-sm font-medium">{header}</div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCollapsedChange?.(!isCollapsed)}
            className="size-8 shrink-0"
            data-testid="sidebar-collapse"
          >
            {isCollapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        </div>

        <nav
          className={cn(
            "flex flex-1 flex-col gap-1 py-2",
            isCollapsed ? "items-center px-2" : "px-2"
          )}
        >
          {children}
        </nav>
        {footer && (
          <div
            className={cn(
              "mt-auto border-t py-2",
              isCollapsed ? "flex justify-center px-2" : "px-2"
            )}
          >
            {footer}
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export { Sidebar };
export type { SidebarProps };
