"use client";

import { cn } from "../lib/utils";
import { ModeToggle } from "./mode-toggle";

function Header({ className, ...props }: React.ComponentProps<"header">) {
  return (
    <header
      className={cn(
        "flex h-16 items-center justify-between border-b px-6",
        className
      )}
      {...props}
    >
      <span className="text-xl font-semibold">Kombuse</span>
      <nav className="flex items-center gap-4">
        {props.children}
        <ModeToggle />
      </nav>
    </header>
  );
}

export { Header };
