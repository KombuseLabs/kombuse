'use client'

import type { ActorType } from '@kombuse/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'

interface AuthorTypePickerProps {
  value: ActorType | null
  onValueChange: (value: ActorType | null) => void
  disabled?: boolean
}

const ANY_AUTHOR_SENTINEL = '__any__'

const AUTHOR_TYPE_OPTIONS = [
  { value: ANY_AUTHOR_SENTINEL, label: 'Any author (no filter)' },
  { value: 'user' as const, label: 'Human users only' },
  { value: 'agent' as const, label: 'Agents only' },
]

export function getAuthorTypeLabel(authorType: string): string {
  if (authorType === 'user') return 'Human only'
  if (authorType === 'agent') return 'Agent only'
  return authorType
}

function AuthorTypePicker({ value, onValueChange, disabled }: AuthorTypePickerProps) {
  return (
    <Select
      value={value ?? ANY_AUTHOR_SENTINEL}
      onValueChange={(v) => {
        if (v === ANY_AUTHOR_SENTINEL) {
          onValueChange(null)
        } else {
          onValueChange(v as ActorType)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Any author (no filter)" />
      </SelectTrigger>
      <SelectContent>
        {AUTHOR_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { AuthorTypePicker }
export type { AuthorTypePickerProps }
