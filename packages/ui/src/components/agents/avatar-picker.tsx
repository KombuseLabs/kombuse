'use client'

import {
  Bot,
  Brain,
  Zap,
  Sparkles,
  MessageSquare,
  Lightbulb,
  Target,
  Wand2,
  Cog,
  Shield,
  BookOpen,
  PenTool,
  Search,
  Code,
  Database,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const PRESET_AVATARS: { icon: LucideIcon; name: string }[] = [
  { icon: Bot, name: 'bot' },
  { icon: Brain, name: 'brain' },
  { icon: Zap, name: 'zap' },
  { icon: Sparkles, name: 'sparkles' },
  { icon: MessageSquare, name: 'message' },
  { icon: Lightbulb, name: 'lightbulb' },
  { icon: Target, name: 'target' },
  { icon: Wand2, name: 'wand' },
  { icon: Cog, name: 'cog' },
  { icon: Shield, name: 'shield' },
  { icon: BookOpen, name: 'book' },
  { icon: PenTool, name: 'pen' },
  { icon: Search, name: 'search' },
  { icon: Code, name: 'code' },
  { icon: Database, name: 'database' },
]

interface AvatarPickerProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

function AvatarPicker({ value, onChange, disabled }: AvatarPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {PRESET_AVATARS.map(({ icon: Icon, name }) => (
        <button
          key={name}
          type="button"
          onClick={() => onChange(name)}
          disabled={disabled}
          className={cn(
            'size-10 rounded-lg border-2 flex items-center justify-center transition-all',
            value === name
              ? 'border-primary bg-primary/10 scale-110'
              : 'border-muted hover:border-primary/50 hover:scale-105',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          <Icon className="size-5" />
        </button>
      ))}
    </div>
  )
}

// Helper to get icon component by name
function getAvatarIcon(name: string | null | undefined): LucideIcon {
  const avatar = PRESET_AVATARS.find((a) => a.name === name)
  return avatar?.icon ?? Bot
}

export { AvatarPicker, getAvatarIcon, PRESET_AVATARS }
export type { AvatarPickerProps }
