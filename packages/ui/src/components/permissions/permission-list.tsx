import type { PermissionLogEntry } from '@kombuse/types'
import { cn } from '@/lib/utils'
import { PermissionItem } from './permission-item'

interface PermissionListProps {
  entries: PermissionLogEntry[]
  projectId?: string
  className?: string
  emptyMessage?: string
}

function PermissionList({
  entries,
  projectId,
  className,
  emptyMessage = 'No permission decisions found',
}: PermissionListProps) {
  if (entries.length === 0) {
    return (
      <div className={cn('text-center py-8 text-muted-foreground', className)}>
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={cn('divide-y', className)}>
      {entries.map((entry) => (
        <PermissionItem key={entry.id} entry={entry} projectId={projectId} />
      ))}
    </div>
  )
}

export { PermissionList }
export type { PermissionListProps }
