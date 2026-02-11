"use client";

import type { ReactNode } from "react";
import { cn } from "../lib/utils";
import { useDesktop } from "../hooks/use-desktop";
import { ModeToggle } from "./mode-toggle";

interface HeaderProps extends React.ComponentProps<"header"> {
  center?: ReactNode;
  onNavigateHome?: () => void;
}

function Header({ className, center, onNavigateHome, children, ...props }: HeaderProps) {
  const { isDesktop, platform } = useDesktop();
  const isMac = platform === "darwin";

  return (
    <header
      className={cn(
        "flex items-center border-b px-6",
        isDesktop ? "h-10 electron-drag" : "h-16",
        isMac && "pl-20",
        className
      )}
      {...props}
    >
      <button
        type="button"
        className="shrink-0 text-xl font-semibold cursor-pointer hover:opacity-80 transition-opacity bg-transparent border-none p-0 electron-no-drag"
        onClick={onNavigateHome}
      >
        Kombuse
      </button>
      <div className="flex flex-1 justify-center px-4">
        {center ? <div className="electron-no-drag">{center}</div> : null}
      </div>
      <nav className="flex shrink-0 items-center gap-4 electron-no-drag">
        {children}
        <ModeToggle />
      </nav>
    </header>
  );
}

export { Header };
