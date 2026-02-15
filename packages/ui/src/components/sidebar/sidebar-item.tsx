"use client";

import * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";
import { cva } from "class-variance-authority";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../base/tooltip";

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  variant?: "panel" | "rail";
  isCollapsed?: boolean;
}

const sidebarItemVariants = cva(
  "flex items-center text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        panel: "rounded-md hover:bg-accent hover:text-accent-foreground",
        rail: "size-11 justify-center rounded-xl text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      },
      active: {
        false: "",
        true: "",
      },
    },
    compoundVariants: [
      {
        variant: "panel",
        active: true,
        className: "bg-muted text-foreground font-semibold",
      },
      {
        variant: "rail",
        active: true,
        className: "bg-accent text-foreground font-semibold shadow-sm ring-1 ring-primary/35",
      },
    ],
  }
);

function SidebarItem({
  icon,
  label,
  to,
  variant = "panel",
  isCollapsed,
}: SidebarItemProps) {
  const usesRailStyle = variant === "rail" || isCollapsed;

  const content = (
    <NavLink
      to={to}
      aria-label={usesRailStyle ? label : undefined}
      className={({ isActive }) =>
        cn(
          sidebarItemVariants({
            variant: usesRailStyle ? "rail" : "panel",
            active: isActive,
          }),
          usesRailStyle ? "" : "gap-3 px-3 py-2"
        )
      }
    >
      <span className={cn("shrink-0", usesRailStyle ? "[&>svg]:size-5" : "[&>svg]:size-4")}>
        {icon}
      </span>
      {!usesRailStyle && <span>{label}</span>}
    </NavLink>
  );

  if (usesRailStyle) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" align="center">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return content;
}

export { SidebarItem };
export type { SidebarItemProps };
