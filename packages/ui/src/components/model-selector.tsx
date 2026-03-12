'use client'

import type { BackendType, ModelOption } from '@kombuse/types'
import { useModels } from '../hooks/use-models'
import { cn } from '../lib/utils'

const selectBaseClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm'

export interface ModelSelectorProps {
  backendType: BackendType | undefined
  value: string
  onChange: (modelId: string) => void
  disabled?: boolean
  id?: string
  className?: string
  showDefaultHint?: boolean
}

export function ModelSelector({
  backendType,
  value,
  onChange,
  disabled,
  id,
  className,
  showDefaultHint = true,
}: ModelSelectorProps) {
  const { data: modelCatalog, isLoading } = useModels(backendType)

  if (!backendType) {
    return (
      <select id={id} disabled className={cn(selectBaseClass, className)}>
        <option>Select a backend first</option>
      </select>
    )
  }

  if (isLoading) {
    return (
      <select id={id} disabled className={cn(selectBaseClass, className)}>
        <option>Loading models...</option>
      </select>
    )
  }

  if (!modelCatalog?.supports_model_selection) {
    return (
      <select id={id} disabled className={cn(selectBaseClass, className)}>
        <option>Not supported</option>
      </select>
    )
  }

  const grouped = new Map<string, ModelOption[]>()
  const ungrouped: ModelOption[] = []
  for (const model of modelCatalog.models) {
    if (model.provider) {
      const group = grouped.get(model.provider) ?? []
      group.push(model)
      grouped.set(model.provider, group)
    } else {
      ungrouped.push(model)
    }
  }

  const isLegacyModel = value !== ''
    && !modelCatalog.models.some((m) => m.id === value)

  return (
    <>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(selectBaseClass, className)}
      >
        <option value="">Use backend default</option>
        {ungrouped.map((model) => (
          <option key={model.id} value={model.id}>
            {model.name}
          </option>
        ))}
        {[...grouped.entries()].map(([provider, models]) => (
          <optgroup key={provider} label={provider}>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </optgroup>
        ))}
        {isLegacyModel && (
          <option value={value}>
            {value} (custom)
          </option>
        )}
      </select>
      {modelCatalog.models.length === 0 && (
        <p className="text-sm text-destructive">
          Could not load models — check that the CLI is installed and accessible
        </p>
      )}
      {showDefaultHint && modelCatalog.default_model_id && (
        <p className="text-sm text-muted-foreground">
          Backend default: {modelCatalog.default_model_id}
        </p>
      )}
    </>
  )
}
