"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "../base/button";
import { useDesktop } from "../hooks/use-desktop";
import { ModeToggle } from "./mode-toggle";

interface HeaderProps extends React.ComponentProps<"header"> {
  center?: ReactNode;
  onNavigateHome?: () => void;
  canGoBack?: boolean;
  canGoForward?: boolean;
  onGoBack?: () => void;
  onGoForward?: () => void;
}

function Header({
  className,
  center,
  onNavigateHome,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  children,
  ...props
}: HeaderProps) {
  const { isDesktop, platform } = useDesktop();
  const isMac = platform === "darwin";
  const showNavArrows = onGoBack !== undefined && onGoForward !== undefined;

  return (
    <header
      className={cn(
        "flex items-center px-6",
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
      <div className="flex flex-1 justify-center px-[21px] mt-[10px]">
        {showNavArrows && (
          <div className="flex items-center gap-0.5 mr-2 electron-no-drag">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!canGoBack}
              onClick={onGoBack}
              aria-label="Go back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              disabled={!canGoForward}
              onClick={onGoForward}
              aria-label="Go forward"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        )}
        {center ? <div className="electron-no-drag">{center}</div> : null}
      </div>
      <nav className="flex shrink-0 items-center gap-4 px-[5px] electron-no-drag mt-[5px]">
        {children}
        <ModeToggle />
      </nav>
    </header>
  );
}

export { Header };
