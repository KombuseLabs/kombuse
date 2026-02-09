import type { PermissionLogEntry } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { extractPermissionDetail } from '../../lib/permission-utils'
import { Badge } from '../../base/badge'
import {
  Terminal,
  FileText,
  Search,
  Globe,
  Shield,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Zap,
} from 'lucide-react'

interface PermissionItemProps {
  entry: PermissionLogEntry
  className?: string
}

const toolIconMap: Record<string, typeof Terminal> = {
  Bash: Terminal,
  Read: FileText,
  Write: FileText,
  Edit: FileText,
  Grep: Search,
  Glob: Search,
  WebFetch: Globe,
  Task: Zap,
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function getBehaviorConfig(entry: PermissionLogEntry) {
  if (entry.auto_approved) {
    return {
      icon: ShieldCheck,
      label: 'Auto-approved',
      color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
      iconColor: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    }
  }
  if (entry.behavior === 'allow') {
    return {
      icon: ShieldCheck,
      label: 'Allowed',
      color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
      iconColor: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    }
  }
  if (entry.behavior === 'deny') {
    return {
      icon: ShieldX,
      label: 'Denied',
      color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      iconColor: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    }
  }
  return {
    icon: ShieldAlert,
    label: 'Pending',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    iconColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  }
}

function PermissionItem({ entry, className }: PermissionItemProps) {
  const behaviorConfig = getBehaviorConfig(entry)
  const ToolIcon = toolIconMap[entry.tool_name] || Shield
  const detail = extractPermissionDetail(entry.tool_name, {}, entry.description)

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors',
        className
      )}
    >
      <div
        className={cn(
          'size-8 rounded-full flex items-center justify-center shrink-0',
          behaviorConfig.iconColor
        )}
      >
        <ToolIcon className="size-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{entry.tool_name}</span>
          <Badge variant="outline" className={cn('text-xs', behaviorConfig.color)}>
            {behaviorConfig.label}
          </Badge>
        </div>

        {entry.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {entry.description}
          </p>
        )}

        {!entry.description && detail && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {detail.label}: {detail.value}
          </p>
        )}

        {entry.deny_message && (
          <p className="text-xs text-red-600 dark:text-red-400 mt-1 truncate">
            {entry.deny_message}
          </p>
        )}
      </div>

      <div className="text-xs text-muted-foreground shrink-0 text-right">
        <div>{formatRelativeTime(entry.requested_at)}</div>
        <div className="text-[10px]">
          {new Date(entry.requested_at).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}

export { PermissionItem }
export type { PermissionItemProps }
