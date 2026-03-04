"use client";

import { PanelLeft } from "lucide-react";
import { Button } from "../base/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "../base/tooltip";
import { useCommand } from "../hooks/use-command";
import { useProfileSetting } from "../hooks/use-profile-settings";
import { useCurrentProject } from "../hooks/use-app-context";
import { cn } from "../lib/utils";

const USER_PROFILE_ID = "user-1";
const LIST_PANEL_HIDDEN_SETTING_KEY = "layout.listPanelHidden";

function LayoutToggle() {
  const { currentProjectId } = useCurrentProject();
  const { execute } = useCommand("layout.toggleListPanel");
  const { data: setting } = useProfileSetting(
    USER_PROFILE_ID,
    LIST_PANEL_HIDDEN_SETTING_KEY
  );
  const listPanelHidden = setting?.setting_value === "true";

  if (!currentProjectId) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-7", !listPanelHidden && "bg-accent")}
          onClick={() => execute()}
          aria-label={listPanelHidden ? "Show list panel" : "Hide list panel"}
        >
          <PanelLeft className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {listPanelHidden ? "Show list panel" : "Hide list panel"} (Mod+B)
      </TooltipContent>
    </Tooltip>
  );
}

export { LayoutToggle };
