"use client";

import * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../base/tooltip";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  isCollapsed?: boolean;
}

function SidebarItem({ icon, label, to, isCollapsed }: SidebarItemProps) {
  const content = (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center rounded-md text-sm font-medium transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent text-accent-foreground",
          isCollapsed
            ? "w-10 py-2 justify-center"
            : "gap-3 px-3 py-2"
        )
      }
    >
      <span className={cn("shrink-0", isCollapsed && "[&>svg]:size-5")}>
        {icon}
      </span>
      {!isCollapsed && <span>{label}</span>}
    </NavLink>
  );

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export { SidebarItem };
export type { SidebarItemProps };
