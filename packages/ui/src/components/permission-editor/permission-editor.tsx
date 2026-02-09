'use client'

import { useState } from 'react'
import type { Permission } from '@kombuse/types'
import { ChevronDown, ChevronRight, Plus, Shield } from 'lucide-react'
import { Button } from '../../base/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../base/collapsible'
import { PermissionRuleList } from './permission-rule-list'
import { PermissionRuleForm } from './permission-rule-form'

interface PermissionEditorProps {
  permissions: Permission[]
  onChange: (permissions: Permission[]) => void
  className?: string
}

type EditorMode = 'list' | 'create' | 'edit'

function PermissionEditor({ permissions, onChange, className }: PermissionEditorProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [mode, setMode] = useState<EditorMode>('list')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const handleAdd = () => {
    setEditingIndex(null)
    setMode('create')
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    setMode('edit')
  }

  const handleDelete = (index: number) => {
    const next = permissions.filter((_, i) => i !== index)
    onChange(next)
  }

  const handleCancel = () => {
    setMode('list')
    setEditingIndex(null)
  }

  const handleFormSubmit = (permission: Permission) => {
    if (mode === 'create') {
      onChange([...permissions, permission])
    } else if (mode === 'edit' && editingIndex !== null) {
      const next = permissions.map((p, i) => (i === editingIndex ? permission : p))
      onChange(next)
    }
    setMode('list')
    setEditingIndex(null)
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={className}>
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
          >
            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Shield className="size-4" />
            <span className="font-medium">Permissions</span>
            {permissions.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({permissions.length} rule{permissions.length !== 1 ? 's' : ''})
              </span>
            )}
          </Button>
        </CollapsibleTrigger>

        {isOpen && mode === 'list' && (
          <Button variant="outline" size="sm" onClick={handleAdd}>
            <Plus className="size-4 mr-1" />
            Add Permission
          </Button>
        )}
      </div>

      <CollapsibleContent className="pt-4">
        {mode === 'list' ? (
          <PermissionRuleList
            permissions={permissions}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : (
          <PermissionRuleForm
            permission={editingIndex !== null ? permissions[editingIndex] : undefined}
            onSubmit={handleFormSubmit}
            onCancel={handleCancel}
          />
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export { PermissionEditor }
export type { PermissionEditorProps }
