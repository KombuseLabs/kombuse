import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { X } from 'lucide-react'

interface LabelBadgeProps {
  label: Label
  className?: string
  onRemove?: () => void
  size?: 'sm' | 'default'
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#000000' : '#ffffff'
}

function LabelBadge({ label, className, onRemove, size = 'default' }: LabelBadgeProps) {
  const textColor = getContrastColor(label.color)

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs',
        className
      )}
      style={{ backgroundColor: label.color, color: textColor }}
    >
      {label.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/20"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

export { LabelBadge, getContrastColor }
