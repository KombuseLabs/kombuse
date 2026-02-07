'use client'

import type { MentionType } from '@kombuse/types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'

interface MentionTypePickerProps {
  value: MentionType | null
  onValueChange: (value: MentionType) => void
  disabled?: boolean
}

const MENTION_TYPE_OPTIONS = [
  { value: 'profile' as const, label: 'Profile mention (@) — self' },
  { value: 'ticket' as const, label: 'Ticket mention (#)' },
]

export function getMentionTypeLabel(mentionType: string): string {
  return MENTION_TYPE_OPTIONS.find((o) => o.value === mentionType)?.label ?? mentionType
}

function MentionTypePicker({ value, onValueChange, disabled }: MentionTypePickerProps) {
  return (
    <Select
      value={value ?? ''}
      onValueChange={(v) => onValueChange(v as MentionType)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select mention type..." />
      </SelectTrigger>
      <SelectContent>
        {MENTION_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { MentionTypePicker }
export type { MentionTypePickerProps }
