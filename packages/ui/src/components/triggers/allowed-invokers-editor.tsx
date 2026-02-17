'use client'

import type { AllowedInvoker } from '@kombuse/types'
import { Plus, Shield, Trash2 } from 'lucide-react'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Label } from '../../base/label'
import { Switch } from '../../base/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'

export interface AllowedInvokersEditorProps {
  value: AllowedInvoker[] | null
  onChange: (value: AllowedInvoker[] | null) => void
  disabled?: boolean
}

const INVOKER_TYPE_OPTIONS = [
  { value: 'any', label: 'Anyone' },
  { value: 'user', label: 'Human users' },
  { value: 'agent', label: 'Agent' },
  { value: 'system', label: 'System' },
] as const

function AllowedInvokersEditor({ value, onChange, disabled }: AllowedInvokersEditorProps) {
  const isRestricted = value !== null

  const handleToggleRestricted = (restricted: boolean) => {
    onChange(restricted ? [] : null)
  }

  const handleAddRule = () => {
    onChange([...(value ?? []), { type: 'user' }])
  }

  const handleRemoveRule = (index: number) => {
    const next = (value ?? []).filter((_, i) => i !== index)
    onChange(next)
  }

  const handleUpdateRule = (index: number, rule: AllowedInvoker) => {
    const next = (value ?? []).map((r, i) => (i === index ? rule : r))
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="flex items-center gap-2">
            <Shield className="size-4" />
            Invoker Restrictions
          </Label>
          <p className="text-xs text-muted-foreground">
            {isRestricted
              ? 'Only matching invokers can fire this trigger'
              : 'Any actor can fire this trigger'}
          </p>
        </div>
        <Switch
          checked={isRestricted}
          onCheckedChange={handleToggleRestricted}
          disabled={disabled}
          aria-label="Toggle invoker restrictions"
        />
      </div>

      {isRestricted && (
        <div className="space-y-2 pl-2 border-l-2 border-muted">
          {(value ?? []).map((rule, index) => (
            <InvokerRuleRow
              key={index}
              rule={rule}
              onChange={(r) => handleUpdateRule(index, r)}
              onRemove={() => handleRemoveRule(index)}
              disabled={disabled}
            />
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddRule}
            disabled={disabled}
            className="w-full"
          >
            <Plus className="size-4 mr-2" />
            Add Rule
          </Button>

          {value?.length === 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No rules defined — no one can fire this trigger
            </p>
          )}
        </div>
      )}
    </div>
  )
}

interface InvokerRuleRowProps {
  rule: AllowedInvoker
  onChange: (rule: AllowedInvoker) => void
  onRemove: () => void
  disabled?: boolean
}

function InvokerRuleRow({ rule, onChange, onRemove, disabled }: InvokerRuleRowProps) {
  const handleTypeChange = (newType: string) => {
    switch (newType) {
      case 'any':
        onChange({ type: 'any' })
        break
      case 'user':
        onChange({ type: 'user' })
        break
      case 'system':
        onChange({ type: 'system' })
        break
      case 'agent':
        onChange({ type: 'agent' })
        break
    }
  }

  return (
    <div className="flex items-start gap-2 p-2 rounded border bg-background">
      <Select value={rule.type} onValueChange={handleTypeChange} disabled={disabled}>
        <SelectTrigger className="w-[140px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {INVOKER_TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {rule.type === 'agent' && (
        <div className="flex flex-1 flex-col gap-2">
          <Input
            value={rule.agent_id ?? ''}
            onChange={(e) =>
              onChange({
                type: 'agent',
                agent_id: e.target.value || undefined,
                agent_type: rule.agent_type,
              })
            }
            placeholder="Agent ID (optional)"
            disabled={disabled}
            className="text-xs"
          />
          <Input
            value={rule.agent_type ?? ''}
            onChange={(e) =>
              onChange({
                type: 'agent',
                agent_id: rule.agent_id,
                agent_type: e.target.value || undefined,
              })
            }
            placeholder="Agent type (optional, e.g. coder)"
            disabled={disabled}
            className="text-xs"
          />
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        disabled={disabled}
        className="shrink-0"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  )
}

function summarizeInvokers(invokers: AllowedInvoker[] | null): string | null {
  if (!invokers || invokers.length === 0) return null

  const labels = invokers.map((rule) => {
    switch (rule.type) {
      case 'any':
        return 'Anyone'
      case 'user':
        return 'Users'
      case 'system':
        return 'System'
      case 'agent': {
        if (rule.agent_type) return `type:${rule.agent_type}`
        if (rule.agent_id) return `agent:${rule.agent_id.slice(0, 8)}…`
        return 'Any agent'
      }
      default:
        return 'Unknown'
    }
  })

  return labels.join(' | ')
}

export { AllowedInvokersEditor, summarizeInvokers }
