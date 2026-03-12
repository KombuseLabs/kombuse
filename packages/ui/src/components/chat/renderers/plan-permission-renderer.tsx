'use client'

import { useState } from 'react'
import type { SerializedAgentPermissionRequestEvent } from '@kombuse/types'
import { FileCheck } from 'lucide-react'
import { Button } from '@/base/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/base/dialog'
import { Markdown } from '../../markdown'
import { EventCard } from './event-card'

export interface PlanPermissionRendererProps {
  event: SerializedAgentPermissionRequestEvent
}

function isAllowedPromptsArray(value: unknown): value is { tool: string; prompt: string }[] {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as Record<string, unknown>).tool === 'string' &&
      typeof (item as Record<string, unknown>).prompt === 'string'
  )
}

export function PlanPermissionRenderer({ event }: PlanPermissionRendererProps) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const { input, timestamp } = event
  const description = typeof input.description === 'string' ? input.description : null
  const allowedPrompts = isAllowedPromptsArray(input.allowedPrompts) ? input.allowedPrompts : null
  const planContent = typeof input.plan === 'string' ? input.plan : null

  const card = (
    <EventCard
      timestamp={timestamp}
      className="border border-border bg-muted/40"
      header={
        <>
          <FileCheck className="size-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase text-muted-foreground">
            Plan Review
          </span>
        </>
      }
    >
      {description && (
        <p className="mb-2 text-foreground">{description}</p>
      )}
      {allowedPrompts && allowedPrompts.length > 0 && (
        <div>
          <span className="text-xs font-medium text-muted-foreground">
            Permissions needed:
          </span>
          <div className="mt-1 flex flex-wrap gap-1">
            {allowedPrompts.map((ap, i) => (
              <span
                key={i}
                className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground"
              >
                {ap.prompt}
              </span>
            ))}
          </div>
        </div>
      )}
      {planContent && (
        <p className="mt-2 text-xs text-muted-foreground underline">
          View full plan
        </p>
      )}
    </EventCard>
  )

  if (!planContent) {
    return card
  }

  return (
    <>
      <button
        type="button"
        className="block w-full cursor-pointer text-left rounded-lg transition-colors hover:bg-muted/60"
        onClick={() => setDialogOpen(true)}
      >
        {card}
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Plan Review</DialogTitle>
            <DialogDescription>
              {description ?? 'Plan submitted for review.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-0">
            <Markdown>{planContent}</Markdown>
          </div>

          {allowedPrompts && allowedPrompts.length > 0 && (
            <div className="border-t border-border pt-3">
              <span className="text-xs font-medium text-muted-foreground">
                Permissions needed:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {allowedPrompts.map((ap, i) => (
                  <span
                    key={i}
                    className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground"
                  >
                    {ap.prompt}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
