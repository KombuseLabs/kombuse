import { useCallback, useEffect, useState } from 'react'
import type { Attachment } from '@kombuse/types'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { cn } from '../lib/utils'
import { attachmentsApi } from '../lib/api'

interface ImageLightboxProps {
  attachments: Attachment[]
  initialIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
}

function ImageLightbox({
  attachments,
  initialIndex,
  open,
  onOpenChange,
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // Reset index when lightbox opens with a new initialIndex
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex)
    }
  }, [open, initialIndex])

  const imageAttachments = attachments.filter((a) =>
    a.mime_type.startsWith('image/')
  )

  const current = imageAttachments[currentIndex]
  const hasMultiple = imageAttachments.length > 1

  const goNext = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % imageAttachments.length)
  }, [imageAttachments.length])

  const goPrev = useCallback(() => {
    setCurrentIndex(
      (i) => (i - 1 + imageAttachments.length) % imageAttachments.length
    )
  }, [imageAttachments.length])

  useEffect(() => {
    if (!open) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' && hasMultiple) {
        e.preventDefault()
        goNext()
      } else if (e.key === 'ArrowLeft' && hasMultiple) {
        e.preventDefault()
        goPrev()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, hasMultiple, goNext, goPrev])

  if (!current) return null

  const downloadUrl = attachmentsApi.downloadUrl(current.id)

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            {current.filename}
          </DialogPrimitive.Title>

          {/* Close button */}
          <DialogPrimitive.Close className="absolute top-4 right-4 z-10 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50">
            <X className="size-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>

          {/* Navigation arrows */}
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Previous image"
              >
                <ChevronLeft className="size-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white/80 transition-colors hover:bg-black/70 hover:text-white focus:outline-none focus:ring-2 focus:ring-white/50"
                aria-label="Next image"
              >
                <ChevronRight className="size-6" />
              </button>
            </>
          )}

          {/* Image */}
          <img
            src={downloadUrl}
            alt={current.filename}
            className="max-h-[85vh] max-w-[90vw] object-contain"
          />

          {/* Footer: filename, counter, download */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/60 px-4 py-2 text-sm text-white/90">
            <span className="max-w-64 truncate">{current.filename}</span>
            {hasMultiple && (
              <span className="text-white/60">
                {currentIndex + 1} / {imageAttachments.length}
              </span>
            )}
            <a
              href={downloadUrl}
              download={current.filename}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'inline-flex items-center gap-1 text-white/70 transition-colors hover:text-white'
              )}
            >
              <Download className="size-4" />
              <span className="sr-only">Download</span>
            </a>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { ImageLightbox }
export type { ImageLightboxProps }
