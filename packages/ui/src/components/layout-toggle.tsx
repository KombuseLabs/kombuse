"use client";

import { PanelLeft, Square } from "lucide-react";
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

function LayoutToggleButtons() {
  const { currentProjectId } = useCurrentProject();
  const { execute } = useCommand("layout.toggleListPanel");
  const { data: setting } = useProfileSetting(
    USER_PROFILE_ID,
    LIST_PANEL_HIDDEN_SETTING_KEY
  );
  const listPanelHidden = setting?.setting_value === "true";

  if (!currentProjectId) return null;

  return (
    <div className="flex items-center rounded-md border border-border">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 rounded-r-none",
              !listPanelHidden && "bg-accent"
            )}
            onClick={() => listPanelHidden && execute()}
            aria-label="Show list and detail panels"
          >
            <PanelLeft className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>List + Detail</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "size-7 rounded-l-none border-l border-border",
              listPanelHidden && "bg-accent"
            )}
            onClick={() => !listPanelHidden && execute()}
            aria-label="Show detail panel only"
          >
            <Square className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Detail only (Mod+B)</TooltipContent>
      </Tooltip>
    </div>
  );
}

export { LayoutToggleButtons };
