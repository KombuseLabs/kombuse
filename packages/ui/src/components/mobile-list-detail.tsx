"use client"

import type { ReactNode } from "react"
import { Button } from "../base/button"
import { ArrowLeft } from "lucide-react"
import { cn } from "../lib/utils"

interface MobileListDetailProps {
  hasSelection: boolean
  onBack: () => void
  list: ReactNode
  detail: ReactNode
  backLabel?: string
  className?: string
}

function MobileListDetail({
  hasSelection,
  onBack,
  list,
  detail,
  backLabel = "Back",
  className,
}: MobileListDetailProps) {
  if (!hasSelection) {
    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        {list}
      </div>
    )
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="gap-1"
        >
          <ArrowLeft className="size-4" />
          {backLabel}
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {detail}
      </div>
    </div>
  )
}

export { MobileListDetail }
export type { MobileListDetailProps }
