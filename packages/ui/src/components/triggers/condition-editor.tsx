'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../base/select'

interface ConditionRow {
  id: string
  key: string
  value: string
  isExclude: boolean
}

interface ConditionEditorProps {
  conditions: Record<string, unknown> | null
  onChange: (conditions: Record<string, unknown> | null) => void
  disabled?: boolean
}

const SUGGESTED_KEYS = [
  'status',
  'priority',
  'project_id',
  'label_id',
  'assignee_id',
  'mention_type',
  'completing_agent_id',
  'completing_agent_type',
  'changes',
  'author_type',
]

function conditionsToRows(conditions: Record<string, unknown> | null): ConditionRow[] {
  if (!conditions) return []
  return Object.entries(conditions).map(([key, value]) => {
    const isExclude = key.startsWith('exclude_')
    return {
      id: crypto.randomUUID(),
      key: isExclude ? key.slice('exclude_'.length) : key,
      value: String(value),
      isExclude,
    }
  })
}

function rowsToConditions(rows: ConditionRow[]): Record<string, unknown> | null {
  const validRows = rows.filter((r) => r.key.trim() && r.value.trim())
  if (validRows.length === 0) return null
  return Object.fromEntries(
    validRows.map((r) => [r.isExclude ? `exclude_${r.key}` : r.key, r.value])
  )
}

function ConditionEditor({ conditions, onChange, disabled }: ConditionEditorProps) {
  const [rows, setRows] = useState<ConditionRow[]>(() => conditionsToRows(conditions))

  useEffect(() => {
    setRows(conditionsToRows(conditions))
  }, [conditions])

  const addRow = () => {
    const newRows = [...rows, { id: crypto.randomUUID(), key: '', value: '', isExclude: false }]
    setRows(newRows)
  }

  const removeRow = (id: string) => {
    const newRows = rows.filter((r) => r.id !== id)
    setRows(newRows)
    onChange(rowsToConditions(newRows))
  }

  const updateRow = (id: string, field: 'key' | 'value', value: string) => {
    const newRows = rows.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    setRows(newRows)
    onChange(rowsToConditions(newRows))
  }

  const toggleExclude = (id: string, isExclude: boolean) => {
    const newRows = rows.map((r) => (r.id === id ? { ...r, isExclude } : r))
    setRows(newRows)
    onChange(rowsToConditions(newRows))
  }

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            value={row.key}
            onChange={(e) => updateRow(row.id, 'key', e.target.value)}
            placeholder="Key (e.g., status)"
            className="flex-1"
            disabled={disabled}
            list="condition-keys"
          />
          <Select
            value={row.isExclude ? 'exclude' : 'match'}
            onValueChange={(v) => toggleExclude(row.id, v === 'exclude')}
            disabled={disabled}
          >
            <SelectTrigger className="w-[100px] shrink-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match">matches</SelectItem>
              <SelectItem value="exclude">excludes</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={row.value}
            onChange={(e) => updateRow(row.id, 'value', e.target.value)}
            placeholder="Value"
            className="flex-1"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeRow(row.id)}
            disabled={disabled}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addRow}
        disabled={disabled}
        className="w-full"
      >
        <Plus className="size-4 mr-2" />
        Add Condition
      </Button>

      <datalist id="condition-keys">
        {SUGGESTED_KEYS.map((key) => (
          <option key={key} value={key} />
        ))}
      </datalist>
    </div>
  )
}

export { ConditionEditor }
export type { ConditionEditorProps }
