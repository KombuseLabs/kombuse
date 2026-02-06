"use client"

import { useRef, useState } from 'react'
import type { Label } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Check, Pipette } from 'lucide-react'

const PRESET_COLORS = [
  // Row 1 — vivid
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  // Row 2 — soft
  '#fca5a5', // soft red
  '#fdba74', // soft orange
  '#fcd34d', // soft yellow
  '#86efac', // soft green
  '#5eead4', // soft teal
  '#67e8f9', // soft cyan
  '#93c5fd', // soft blue
  '#c4b5fd', // soft violet
  '#f9a8d4', // soft pink
  // Row 3 — deep
  '#b91c1c', // deep red
  '#c2410c', // deep orange
  '#a16207', // deep amber
  '#15803d', // deep green
  '#0f766e', // deep teal
  '#1d4ed8', // deep blue
  '#6d28d9', // deep violet
  '#be185d', // deep pink
  '#6b7280', // gray
] as const

const DEFAULT_COLOR = '#58a6ff'

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/

interface LabelFormProps {
  label?: Label
  onSubmit: (data: { name: string; color: string }) => void | Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

function LabelForm({ label, onSubmit, onCancel, isLoading }: LabelFormProps) {
  const [name, setName] = useState(label?.name ?? '')
  const [color, setColor] = useState(label?.color ?? DEFAULT_COLOR)
  const [hexInput, setHexInput] = useState(label?.color ?? DEFAULT_COLOR)
  const nativePickerRef = useRef<HTMLInputElement>(null)

  const isCustomColor = !PRESET_COLORS.includes(color as (typeof PRESET_COLORS)[number])
  const isHexValid = HEX_COLOR_RE.test(hexInput)

  const handleHexChange = (value: string) => {
    // Auto-prepend # if the user starts typing digits
    if (value && !value.startsWith('#')) {
      value = '#' + value
    }
    setHexInput(value)
    if (HEX_COLOR_RE.test(value)) {
      setColor(value.toLowerCase())
    }
  }

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setColor(value)
    setHexInput(value)
  }

  const handlePresetClick = (presetColor: string) => {
    setColor(presetColor)
    setHexInput(presetColor)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (name.trim() && isHexValid) {
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
      <div className="space-y-2">
        <div className="grid grid-cols-9 gap-1">
          {PRESET_COLORS.map((presetColor) => (
            <button
              key={presetColor}
              type="button"
              onClick={() => handlePresetClick(presetColor)}
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
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={cn(
              'size-6 shrink-0 rounded-full border-2 flex items-center justify-center transition-all',
              isCustomColor
                ? 'border-foreground scale-110'
                : 'border-muted-foreground/30'
            )}
            style={{ backgroundColor: color }}
            onClick={() => nativePickerRef.current?.click()}
          >
            {isCustomColor && (
              <Check
                className="size-3"
                style={{ color: getContrastColor(color) }}
              />
            )}
          </button>
          <div className="relative flex-1">
            <Input
              value={hexInput}
              onChange={(e) => handleHexChange(e.target.value)}
              placeholder="#000000"
              className={cn(
                'h-7 text-xs font-mono pr-7',
                !isHexValid && hexInput !== '' && 'border-destructive'
              )}
              maxLength={7}
            />
            <button
              type="button"
              onClick={() => nativePickerRef.current?.click()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pipette className="size-3.5" />
            </button>
          </div>
          <input
            ref={nativePickerRef}
            type="color"
            value={color}
            onChange={handleNativePickerChange}
            className="sr-only"
            tabIndex={-1}
            aria-label="Pick a custom color"
          />
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
        <Button type="submit" size="sm" disabled={!name.trim() || !isHexValid || isLoading}>
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
