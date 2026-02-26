import { useCallback, useEffect, useState } from 'react'
import type { ImageAttachment } from '@kombuse/types'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

interface ChatImageGalleryProps {
  images: ImageAttachment[]
}

function dataUri(image: ImageAttachment) {
  return `data:${image.mediaType};base64,${image.data}`
}

function ChatImageGallery({ images }: ChatImageGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(0)

  const openLightbox = (index: number) => {
    setCurrentIndex(index)
    setLightboxOpen(true)
  }

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((image, index) => (
          <button
            key={index}
            type="button"
            className="overflow-hidden rounded-md border border-border/50 transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary/50"
            onClick={() => openLightbox(index)}
          >
            <img
              src={dataUri(image)}
              alt={`Image ${index + 1}`}
              className="max-h-48 max-w-72 object-cover"
            />
          </button>
        ))}
      </div>

      <ChatImageLightbox
        images={images}
        currentIndex={currentIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        onIndexChange={setCurrentIndex}
      />
    </>
  )
}

interface ChatImageLightboxProps {
  images: ImageAttachment[]
  currentIndex: number
  open: boolean
  onOpenChange: (open: boolean) => void
  onIndexChange: (index: number) => void
}

function ChatImageLightbox({
  images,
  currentIndex,
  open,
  onOpenChange,
  onIndexChange,
}: ChatImageLightboxProps) {
  const hasMultiple = images.length > 1

  const goNext = useCallback(() => {
    onIndexChange((currentIndex + 1) % images.length)
  }, [currentIndex, images.length, onIndexChange])

  const goPrev = useCallback(() => {
    onIndexChange((currentIndex - 1 + images.length) % images.length)
  }, [currentIndex, images.length, onIndexChange])

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

  const current = images[currentIndex]
  if (!current) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/90 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col items-center justify-center outline-none"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">
            Image {currentIndex + 1} of {images.length}
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
            src={dataUri(current)}
            alt={`Image ${currentIndex + 1}`}
            className="max-h-[85vh] max-w-[90vw] object-contain"
          />

          {/* Footer: counter */}
          {hasMultiple && (
            <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-3 rounded-lg bg-black/60 px-4 py-2 text-sm text-white/90">
              <span>
                {currentIndex + 1} / {images.length}
              </span>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { ChatImageGallery }
export type { ChatImageGalleryProps }
