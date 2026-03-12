"use client"

import { NavLink, useLocation } from "react-router-dom"
import { cn } from "@/lib/utils"
import { Ticket, MessageSquare, Bot, Tags } from "lucide-react"
import type { ReactNode } from "react"

interface BottomNavProps {
  projectId: string
  className?: string
}

interface BottomNavItem {
  icon: ReactNode
  label: string
  to: string
}

function BottomNav({ projectId, className }: BottomNavProps) {
  const { pathname } = useLocation()

  const items: BottomNavItem[] = [
    { icon: <Ticket className="size-5" />, label: "Tickets", to: `/projects/${projectId}/tickets` },
    { icon: <MessageSquare className="size-5" />, label: "Chats", to: `/projects/${projectId}/chats` },
    { icon: <Bot className="size-5" />, label: "Agents", to: `/projects/${projectId}/agents` },
    { icon: <Tags className="size-5" />, label: "Labels", to: `/projects/${projectId}/labels` },
  ]

  return (
    <nav
      className={cn(
        "flex shrink-0 items-center justify-around border-t border-border/80 bg-background/95 backdrop-blur-sm",
        "h-14 px-2 pb-[env(safe-area-inset-bottom)]",
        className
      )}
      data-testid="bottom-nav"
    >
      {items.map((item) => {
        const isActive = pathname === item.to || pathname.startsWith(item.to + "/")
        return (
          <NavLink
            key={item.to}
            to={item.to}
            data-testid={`bottom-nav-item-${item.label.toLowerCase()}`}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors",
              isActive
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground"
            )}
          >
            <span className={cn("transition-colors", isActive && "text-primary")}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}

export { BottomNav }
export type { BottomNavProps }
