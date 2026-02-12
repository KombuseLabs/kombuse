'use client'

import { User, Settings } from 'lucide-react'
import { Button } from '../base/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../base/dropdown-menu'

export interface ProfileButtonProps {
  onNavigate?: (path: string) => void
}

export function ProfileButton({ onNavigate }: ProfileButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="User menu">
          <User className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => onNavigate?.('/profile')}>
          <User className="size-4" />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onNavigate?.('/settings')}>
          <Settings className="size-4" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
