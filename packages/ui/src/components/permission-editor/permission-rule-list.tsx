'use client'

import type { Permission } from '@kombuse/types'
import { Shield } from 'lucide-react'
import { PermissionRuleItem } from './permission-rule-item'

interface PermissionRuleListProps {
  permissions: Permission[]
  onEdit: (index: number) => void
  onDelete: (index: number) => void
}

function PermissionRuleList({ permissions, onEdit, onDelete }: PermissionRuleListProps) {
  if (permissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Shield className="size-8 mb-2" />
        <p className="text-sm">No permissions configured</p>
        <p className="text-xs">Add a permission to control this agent&apos;s access</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {permissions.map((permission, index) => (
        <PermissionRuleItem
          key={`${permission.type}-${permission.type === 'resource' ? permission.resource : permission.tool}-${index}`}
          permission={permission}
          onEdit={() => onEdit(index)}
          onDelete={() => onDelete(index)}
        />
      ))}
    </div>
  )
}

export { PermissionRuleList }
export type { PermissionRuleListProps }
