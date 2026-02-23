'use client'

import { useState } from 'react'
import type { PluginFile } from '@kombuse/types'
import { ChevronDown, ChevronRight, FileText, Loader2, Save } from 'lucide-react'
import { Button } from '../../base/button'
import { Textarea } from '../../base/textarea'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../base/collapsible'

interface PromptIncludeSectionsProps {
  files: PluginFile[]
  isLoading?: boolean
  onFileUpdate?: (fileId: number, content: string) => Promise<void>
}

function PromptIncludeSections({ files, isLoading, onFileUpdate }: PromptIncludeSectionsProps) {
  const [openIds, setOpenIds] = useState<Set<number>>(new Set())
  const [editingFileId, setEditingFileId] = useState<number | null>(null)
  const [editingFileContent, setEditingFileContent] = useState('')
  const [savingFileId, setSavingFileId] = useState<number | null>(null)

  const toggleOpen = (fileId: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(fileId)) {
        next.delete(fileId)
        if (editingFileId === fileId) {
          setEditingFileId(null)
        }
      } else {
        next.add(fileId)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading included files...
      </div>
    )
  }

  if (files.length === 0) return null

  return (
    <div className="space-y-2 border-t pt-4">
      {files.map((file) => {
        const isOpen = openIds.has(file.id)
        const isEditing = editingFileId === file.id
        const isSaving = savingFileId === file.id

        return (
          <Collapsible
            key={file.id}
            open={isOpen}
            onOpenChange={() => toggleOpen(file.id)}
          >
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 p-0 h-auto hover:bg-transparent"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                  <FileText className="size-4 text-muted-foreground" />
                  <span className="font-mono text-sm">{file.path}</span>
                  {file.is_user_modified && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Modified
                    </span>
                  )}
                </Button>
              </CollapsibleTrigger>

              {isOpen && onFileUpdate && !isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingFileId(file.id)
                    setEditingFileContent(file.content)
                  }}
                >
                  Edit
                </Button>
              )}
            </div>

            <CollapsibleContent className="pt-2">
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editingFileContent}
                    onChange={(e) => setEditingFileContent(e.target.value)}
                    className="font-mono text-xs min-h-40"
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingFileId(null)}
                      disabled={isSaving}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={isSaving || editingFileContent === file.content}
                      onClick={async () => {
                        setSavingFileId(file.id)
                        try {
                          await onFileUpdate?.(file.id, editingFileContent)
                          setEditingFileId(null)
                        } finally {
                          setSavingFileId(null)
                        }
                      }}
                    >
                      {isSaving ? (
                        <Loader2 className="size-3 animate-spin mr-1" />
                      ) : (
                        <Save className="size-3 mr-1" />
                      )}
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
                  {file.content}
                </pre>
              )}
            </CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

export { PromptIncludeSections }
export type { PromptIncludeSectionsProps }
