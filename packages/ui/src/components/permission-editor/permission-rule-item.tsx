'use client'

import type { Permission } from '@kombuse/types'
import { Database, Pencil, Trash2, Wrench } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Badge } from '../../base/badge'
import { getResourceLabel, getToolLabel, getScopeLabel, getActionLabel } from './permission-constants'

interface PermissionRuleItemProps {
  permission: Permission
  onEdit?: () => void
  onDelete?: () => void
  className?: string
}

function PermissionRuleItem({ permission, onEdit, onDelete, className }: PermissionRuleItemProps) {
  const isResource = permission.type === 'resource'
  const Icon = isResource ? Database : Wrench
  const pattern = isResource ? permission.resource : permission.tool
  const label = isResource ? getResourceLabel(permission.resource) : getToolLabel(permission.tool)

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-lg border', className)}>
      <Icon className="size-4 shrink-0 text-muted-foreground" />

      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          <Badge variant="outline" className="mr-2 text-xs font-normal">
            {isResource ? 'Resource' : 'Tool'}
          </Badge>
          {label !== pattern ? `${label} (${pattern})` : pattern}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 flex-wrap">
          {isResource && (
            <span>
              {permission.actions.map(getActionLabel).join(', ')}
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {getScopeLabel(permission.scope)}
          </Badge>
          {isResource && permission.filter && (
            <span className="truncate">Filter: {permission.filter}</span>
          )}
        </div>
      </div>

      {(onEdit || onDelete) && (
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" onClick={onEdit}>
              <Pencil className="size-4" />
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

export { PermissionRuleItem }
export type { PermissionRuleItemProps }
