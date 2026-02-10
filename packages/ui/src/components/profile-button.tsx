'use client'

import { User } from 'lucide-react'
import { Button } from '../base/button'

export interface ProfileButtonProps {
  onNavigate?: (path: string) => void
}

export function ProfileButton({ onNavigate }: ProfileButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => onNavigate?.('/profile')}
      aria-label="View profile"
    >
      <User className="size-5" />
    </Button>
  )
}
