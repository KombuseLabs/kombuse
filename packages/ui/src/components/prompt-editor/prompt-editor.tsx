'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Check, Eye, Edit2, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Textarea } from '../../base/textarea'
import { Button } from '../../base/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../base/collapsible'
import { TEMPLATE_VARIABLE_GROUPS, type TemplateVariableGroup } from './template-variables'

interface PromptEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  minHeight?: number
  maxHeight?: number
  showCounts?: boolean
  showPreview?: boolean
  showAvailableVariables?: boolean
  availableVariables?: TemplateVariableGroup[]
}

// Regex to match template variables like {{ticket.title}}, {{user.name}}
const VARIABLE_REGEX = /\{\{([a-zA-Z_][a-zA-Z0-9_.]*)\}\}/g

function PromptEditor({
  value,
  onChange,
  placeholder = 'Enter your system prompt...',
  disabled = false,
  className,
  minHeight = 200,
  maxHeight = 500,
  showCounts = true,
  showPreview = true,
  showAvailableVariables = false,
  availableVariables,
}: PromptEditorProps) {
  const [copied, setCopied] = useState(false)
  const [isPreview, setIsPreview] = useState(false)
  const [variablesOpen, setVariablesOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight)}px`
    }
  }, [value, minHeight, maxHeight])

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Extract variables from the prompt
  const variables = [...value.matchAll(VARIABLE_REGEX)].map((m) => m[1])
  const uniqueVariables = [...new Set(variables)]
  const usedVariableSet = new Set(uniqueVariables)
  const variableGroups = availableVariables ?? TEMPLATE_VARIABLE_GROUPS

  const insertAtCursor = (variableName: string) => {
    const textarea = textareaRef.current
    if (!textarea || isPreview) return

    const insertText = `{{ ${variableName} }}`
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const before = value.slice(0, start)
    const after = value.slice(end)

    onChange(before + insertText + after)

    requestAnimationFrame(() => {
      textarea.focus()
      const newPos = start + insertText.length
      textarea.setSelectionRange(newPos, newPos)
    })
  }

  // Rough token estimate (1 token ~ 4 chars for English)
  const estimatedTokens = Math.ceil(value.length / 4)

  // Render preview with highlighted variables
  const renderPreview = () => {
    if (!value) {
      return <span className="text-muted-foreground">{placeholder}</span>
    }

    const parts = value.split(VARIABLE_REGEX)
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // This is a variable
        return (
          <span
            key={i}
            className="bg-primary/20 text-primary rounded px-1 font-mono text-sm"
          >
            {`{{${part}}}`}
          </span>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showPreview && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsPreview(!isPreview)}
              disabled={disabled}
            >
              {isPreview ? (
                <Edit2 className="size-4 mr-1" />
              ) : (
                <Eye className="size-4 mr-1" />
              )}
              {isPreview ? 'Edit' : 'Preview'}
            </Button>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={!value}
        >
          {copied ? (
            <Check className="size-4 mr-1" />
          ) : (
            <Copy className="size-4 mr-1" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>

      {/* Editor / Preview */}
      {isPreview ? (
        <div
          className="p-3 rounded-md border bg-muted/30 whitespace-pre-wrap overflow-auto"
          style={{ minHeight, maxHeight }}
        >
          {renderPreview()}
        </div>
      ) : (
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="font-mono text-sm resize-none"
          style={{ minHeight }}
        />
      )}

      {/* Available Variables */}
      {showAvailableVariables && (
        <Collapsible open={variablesOpen} onOpenChange={setVariablesOpen}>
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 px-0 h-auto text-xs text-muted-foreground hover:bg-transparent"
            >
              {variablesOpen ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              Available Variables
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1">
            <div className="rounded-md border bg-muted/30 p-3 space-y-3 text-xs">
              {variableGroups.map((group) => (
                <div key={group.label}>
                  <div className="font-medium text-muted-foreground mb-1">
                    {group.label}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {group.variables.map((variable) => {
                      const isUsed = usedVariableSet.has(variable.name)
                      return (
                        <button
                          key={variable.name}
                          type="button"
                          title={variable.description}
                          onClick={() => insertAtCursor(variable.name)}
                          disabled={disabled || isPreview}
                          className={cn(
                            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono',
                            'border transition-colors cursor-pointer',
                            'hover:bg-primary/10 hover:border-primary/30',
                            'disabled:cursor-not-allowed disabled:opacity-50',
                            isUsed
                              ? 'bg-primary/10 border-primary/20 text-primary'
                              : 'bg-muted border-transparent text-muted-foreground'
                          )}
                        >
                          {isUsed && <Check className="size-3" />}
                          {`{{ ${variable.name} }}`}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {/* Footer with counts and variables */}
      {showCounts && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>{value.length} characters</span>
            <span>~{estimatedTokens} tokens</span>
          </div>
          {uniqueVariables.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span>Variables:</span>
              {uniqueVariables.map((v) => (
                <span key={v} className="bg-muted px-1 rounded font-mono">
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { PromptEditor }
export type { PromptEditorProps }
