"use client"

import { useState } from 'react'
import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Check } from 'lucide-react'

const PRESET_COLORS = [
  '#d73a4a', // red (bug)
  '#0075ca', // blue (documentation)
  '#a2eeef', // cyan (enhancement)
  '#7057ff', // purple
  '#008672', // green
  '#e4e669', // yellow
  '#d876e3', // pink
  '#6e7681', // gray
] as const

const DEFAULT_COLOR = '#d73a4a'

interface LabelFormProps {
  label?: Label
  onSubmit: (data: { name: string; color: string }) => void
  onCancel: () => void
  isLoading?: boolean
}

function LabelForm({ label, onSubmit, onCancel, isLoading }: LabelFormProps) {
  const [name, setName] = useState(label?.name ?? '')
  const [color, setColor] = useState(label?.color ?? DEFAULT_COLOR)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSubmit({ name: name.trim(), color })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 p-3">
      <div>
        <Input
          placeholder="Label name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          className="h-8 text-sm"
        />
      </div>
      <div>
        <div className="flex flex-wrap gap-1">
          {PRESET_COLORS.map((presetColor) => (
            <button
              key={presetColor}
              type="button"
              onClick={() => setColor(presetColor)}
              className={cn(
                'size-6 rounded-full border-2 flex items-center justify-center transition-all',
                color === presetColor
                  ? 'border-foreground scale-110'
                  : 'border-transparent hover:scale-105'
              )}
              style={{ backgroundColor: presetColor }}
            >
              {color === presetColor && (
                <Check
                  className="size-3"
                  style={{
                    color: getContrastColor(presetColor),
                  }}
                />
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!name.trim() || isLoading}>
          {label ? 'Save' : 'Create'}
        </Button>
      </div>
    </form>
  )
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? '#000000' : '#ffffff'
}

export { LabelForm, PRESET_COLORS }
