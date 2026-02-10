"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { ModeToggle } from "./mode-toggle";

interface HeaderProps extends React.ComponentProps<"header"> {
  center?: ReactNode;
  onNavigateHome?: () => void;
}

function Header({ className, center, onNavigateHome, ...props }: HeaderProps) {
  return (
    <header
      className={cn(
        "flex h-16 items-center border-b px-6",
        className
      )}
      {...props}
    >
      <span
        className="shrink-0 text-xl font-semibold cursor-pointer hover:opacity-80 transition-opacity"
        onClick={onNavigateHome}
        role="link"
      >
        Kombuse
      </span>
      <div className="flex flex-1 justify-center px-4">
        {center}
      </div>
      <nav className="flex shrink-0 items-center gap-4">
        {props.children}
        <ModeToggle />
      </nav>
    </header>
  );
}

export { Header };
