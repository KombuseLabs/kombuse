import type { ReactNode } from "react"
import { GripVerticalIcon } from "lucide-react"
import * as ResizablePrimitive from "react-resizable-panels"

import { cn } from "../lib/utils"

const defaultResizeTargetMinimumSize: NonNullable<
  ResizablePrimitive.GroupProps["resizeTargetMinimumSize"]
> = {
  coarse: 24,
  fine: 12,
}

function ResizablePanelGroup({
  className,
  resizeTargetMinimumSize = defaultResizeTargetMinimumSize,
  ...props
}: ResizablePrimitive.GroupProps) {
  return (
    <ResizablePrimitive.Group
      data-slot="resizable-panel-group"
      className={cn(
        "flex h-full w-full aria-[orientation=vertical]:flex-col",
        className
      )}
      resizeTargetMinimumSize={resizeTargetMinimumSize}
      {...props}
    />
  )
}

function ResizablePanel({ ...props }: ResizablePrimitive.PanelProps) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizablePrimitive.SeparatorProps & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.Separator
      data-slot="resizable-handle"
      className={cn(
        "bg-border relative flex w-px shrink-0 cursor-col-resize items-center justify-center transition-[background-color,box-shadow,opacity] duration-150 after:absolute after:inset-y-0 after:left-1/2 after:w-3 after:-translate-x-1/2 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background data-[separator=hover]:bg-foreground/15 data-[separator=active]:bg-foreground/30 data-[separator=disabled]:cursor-default data-[separator=disabled]:bg-border/70 data-[separator=disabled]:opacity-70 aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:top-1/2 aria-[orientation=horizontal]:after:left-0 aria-[orientation=horizontal]:after:h-3 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2 [&[aria-orientation=horizontal]>div]:rotate-90 [&[data-separator=hover]>div]:border-foreground/30 [&[data-separator=active]>div]:border-foreground/45 [&[data-separator=active]>div]:text-foreground [&[data-separator=active]>div]:shadow-sm [&[data-separator=disabled]>div]:opacity-60",
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-background/90 text-muted-foreground z-10 flex h-7 w-4 items-center justify-center rounded-md border border-border/80 shadow-xs transition-[border-color,color,box-shadow] duration-150">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.Separator>
  )
}

interface ResizableCardPanelProps {
  side: "list" | "detail"
  className?: string
  children: ReactNode
}

function ResizableCardPanel({ side, className, children }: ResizableCardPanelProps) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col pt-3 pb-6",
        side === "list" ? "pl-6 pr-3" : "pl-3 pr-6",
        className
      )}
    >
      {children}
    </div>
  )
}

function ResizableCardHandle({ className, ...props }: ResizablePrimitive.SeparatorProps) {
  return (
    <ResizableHandle
      className={cn(
        "w-0 bg-transparent data-[separator=hover]:bg-transparent data-[separator=active]:bg-transparent data-[separator=disabled]:bg-transparent",
        className
      )}
      {...props}
    />
  )
}

export { ResizableCardHandle, ResizableCardPanel, ResizableHandle, ResizablePanel, ResizablePanelGroup }
