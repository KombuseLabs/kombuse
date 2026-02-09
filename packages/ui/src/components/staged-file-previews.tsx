import { X } from 'lucide-react'
import { formatFileSize } from '../hooks/use-file-staging'
import { cn } from '../lib/utils'

interface StagedFilePreviewsProps {
  stagedFiles: File[]
  previewUrls: string[]
  onRemove: (index: number) => void
  className?: string
}

function StagedFilePreviews({ stagedFiles, previewUrls, onRemove, className }: StagedFilePreviewsProps) {
  if (stagedFiles.length === 0) return null

  return (
    <div className={cn('flex gap-2 px-1 py-1 overflow-x-auto', className)}>
      {stagedFiles.map((file, index) => (
        <div key={`${file.name}-${index}`} className="relative shrink-0 group">
          <img
            src={previewUrls[index]}
            alt={file.name}
            className="size-16 rounded object-cover border"
          />
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute -top-1 -right-1 size-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="size-2.5" />
          </button>
          <div className="text-[10px] text-muted-foreground truncate max-w-16 mt-0.5">
            {formatFileSize(file.size)}
          </div>
        </div>
      ))}
    </div>
  )
}

export { StagedFilePreviews }
export type { StagedFilePreviewsProps }
