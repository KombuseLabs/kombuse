"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "../base/button";
import { useCommand } from "../hooks";

function ModeToggle() {
  const { resolvedTheme } = useTheme();
  const { execute } = useCommand("theme.toggle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="size-9" />;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => execute()}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="size-5" />
      ) : (
        <Moon className="size-5" />
      )}
    </Button>
  );
}

export { ModeToggle };
