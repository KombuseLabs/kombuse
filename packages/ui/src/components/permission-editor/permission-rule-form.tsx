'use client'

import { useState } from 'react'
import type { Permission, ResourcePermission, ToolPermission } from '@kombuse/types'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Checkbox } from '../../base/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'
import {
  SCOPE_OPTIONS,
  ACTION_OPTIONS,
  COMMON_RESOURCES,
  COMMON_TOOLS,
} from './permission-constants'

type ResourceAction = 'read' | 'create' | 'update' | 'delete' | '*'
type PermissionScope = 'invocation' | 'project' | 'global'

const CUSTOM_VALUE = '__custom__'

interface PermissionRuleFormProps {
  permission?: Permission
  onSubmit: (permission: Permission) => void
  onCancel: () => void
}

function PermissionRuleForm({ permission, onSubmit, onCancel }: PermissionRuleFormProps) {
  const [permissionType, setPermissionType] = useState<'resource' | 'tool'>(
    permission?.type ?? 'resource'
  )

  // Resource fields
  const initialResource = permission?.type === 'resource' ? permission.resource : ''
  const isInitialResourceCustom =
    initialResource !== '' && !COMMON_RESOURCES.some((r) => r.value === initialResource)
  const [resourceSelect, setResourceSelect] = useState(
    isInitialResourceCustom ? CUSTOM_VALUE : initialResource
  )
  const [customResource, setCustomResource] = useState(isInitialResourceCustom ? initialResource : '')
  const [actions, setActions] = useState<Set<ResourceAction>>(
    new Set(permission?.type === 'resource' ? permission.actions : [])
  )
  const [filter, setFilter] = useState(
    permission?.type === 'resource' ? permission.filter ?? '' : ''
  )

  // Tool fields
  const initialTool = permission?.type === 'tool' ? permission.tool : ''
  const isInitialToolCustom =
    initialTool !== '' && !COMMON_TOOLS.some((t) => t.value === initialTool)
  const [toolSelect, setToolSelect] = useState(
    isInitialToolCustom ? CUSTOM_VALUE : initialTool
  )
  const [customTool, setCustomTool] = useState(isInitialToolCustom ? initialTool : '')

  // Common fields
  const [scope, setScope] = useState<PermissionScope>(permission?.scope ?? 'project')

  const resource = resourceSelect === CUSTOM_VALUE ? customResource : resourceSelect
  const tool = toolSelect === CUSTOM_VALUE ? customTool : toolSelect

  const hasWildcardAction = actions.has('*')

  const handleActionToggle = (action: ResourceAction, checked: boolean) => {
    const next = new Set(actions)
    if (action === '*') {
      if (checked) {
        next.clear()
        next.add('*')
      } else {
        next.delete('*')
      }
    } else {
      if (checked) {
        next.add(action)
      } else {
        next.delete(action)
      }
      next.delete('*')
    }
    setActions(next)
  }

  const isValid =
    permissionType === 'resource'
      ? resource.trim().length > 0 && actions.size > 0
      : tool.trim().length > 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValid) return

    if (permissionType === 'resource') {
      const p: ResourcePermission = {
        type: 'resource',
        resource: resource.trim(),
        actions: [...actions] as ResourcePermission['actions'],
        scope,
      }
      if (filter.trim()) {
        p.filter = filter.trim()
      }
      onSubmit(p)
    } else {
      const p: ToolPermission = {
        type: 'tool',
        tool: tool.trim(),
        scope,
      }
      onSubmit(p)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/30">
      {/* Permission Type */}
      <div className="space-y-2">
        <Label>Permission Type</Label>
        <Select
          value={permissionType}
          onValueChange={(v) => setPermissionType(v as 'resource' | 'tool')}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="resource">Resource</SelectItem>
            <SelectItem value="tool">Tool</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {permissionType === 'resource' ? (
        <>
          {/* Resource Pattern */}
          <div className="space-y-2">
            <Label>Resource *</Label>
            <Select value={resourceSelect} onValueChange={setResourceSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a resource..." />
              </SelectTrigger>
              <SelectContent>
                {COMMON_RESOURCES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label} — {r.description}
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_VALUE}>Custom pattern...</SelectItem>
              </SelectContent>
            </Select>
            {resourceSelect === CUSTOM_VALUE && (
              <Input
                value={customResource}
                onChange={(e) => setCustomResource(e.target.value)}
                placeholder="e.g., ticket.priority, attachment.*"
              />
            )}
          </div>

          {/* Actions */}
          <div className="space-y-2">
            <Label>Actions *</Label>
            <div className="flex flex-wrap gap-3">
              {ACTION_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={hasWildcardAction ? true : actions.has(opt.value as ResourceAction)}
                    onCheckedChange={(checked) =>
                      handleActionToggle(opt.value as ResourceAction, checked === true)
                    }
                    disabled={hasWildcardAction && opt.value !== '*'}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          {/* Filter */}
          <div className="space-y-2">
            <Label>Filter (optional)</Label>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="e.g., project:proj-*, status:open"
            />
            <p className="text-xs text-muted-foreground">
              Restrict this permission to matching resources
            </p>
          </div>
        </>
      ) : (
        <>
          {/* Tool Pattern */}
          <div className="space-y-2">
            <Label>Tool *</Label>
            <Select value={toolSelect} onValueChange={setToolSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a tool..." />
              </SelectTrigger>
              <SelectContent>
                {COMMON_TOOLS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label} ({t.value})
                  </SelectItem>
                ))}
                <SelectItem value={CUSTOM_VALUE}>Custom pattern...</SelectItem>
              </SelectContent>
            </Select>
            {toolSelect === CUSTOM_VALUE && (
              <Input
                value={customTool}
                onChange={(e) => setCustomTool(e.target.value)}
                placeholder="e.g., mcp__github__*, WebFetch"
              />
            )}
          </div>
        </>
      )}

      {/* Scope */}
      <div className="space-y-2">
        <Label>Scope *</Label>
        <Select value={scope} onValueChange={(v) => setScope(v as PermissionScope)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCOPE_OPTIONS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label} — {s.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!isValid}>
          {permission ? 'Update' : 'Add'} Permission
        </Button>
      </div>
    </form>
  )
}

export { PermissionRuleForm }
export type { PermissionRuleFormProps }
