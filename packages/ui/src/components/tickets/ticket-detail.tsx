import { useState, useRef } from 'react'
import type { TicketStatus } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '../../base/card'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Textarea } from '../../base/textarea'
import { Tabs, TabsList, TabsTrigger } from '../../base/tabs'
import { X, Trash2, Pencil, Paperclip } from 'lucide-react'
import { LabelBadge } from '../labels/label-badge'
import { LabelSelector } from '../labels/label-selector'
import { StatusIndicator } from '../status-indicator'
import { Markdown } from '../markdown'
import { ImageLightbox } from '../image-lightbox'
import { attachmentsApi } from '../../lib/api'
import { useTicketOperations, useLabelOperations, useTicketAgentStatus, useCurrentProject, useTicketAttachments, useUploadTicketAttachment } from '../../hooks'
import { useTextareaAutocomplete } from '../../hooks/use-textarea-autocomplete'
import { useFileStaging } from '../../hooks/use-file-staging'
import { StagedFilePreviews } from '../staged-file-previews'

interface TicketDetailProps {
  className?: string
  onClose?: () => void
  isEditable?: boolean
}

const statusColors: Record<string, string> = {
  open: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  in_progress:
    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
}

const priorityLabels: Record<number, string> = {
  0: 'Lowest',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Highest',
}

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'closed', label: 'Closed' },
]

function TicketDetail({ className, onClose, isEditable }: TicketDetailProps) {
  const { currentTicket, deleteCurrentTicket, updateCurrentTicket, isDeleting, isUpdating } =
    useTicketOperations()

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editStatus, setEditStatus] = useState<TicketStatus>('open')
  const editBodyRef = useRef<HTMLTextAreaElement>(null)
  const { textareaProps: autocompleteProps, AutocompletePortal } = useTextareaAutocomplete({
    value: editBody,
    onValueChange: setEditBody,
    textareaRef: editBodyRef,
  })

  const {
    ticketLabels,
    projectLabels,
    addLabel,
    removeLabel,
    createLabel,
    updateLabel,
    deleteLabel,
    isCreating: isCreatingLabel,
    isUpdating: isUpdatingLabel,
    isDeleting: isDeletingLabel,
  } = useLabelOperations()

  const { currentProjectId } = useCurrentProject()
  const agentStatus = useTicketAgentStatus(currentTicket?.id)
  const { data: ticketAttachments } = useTicketAttachments(currentTicket?.id ?? 0)
  const uploadTicketAttachment = useUploadTicketAttachment()
  const {
    stagedFiles, previewUrls, isDragOver, hasFiles,
    removeFile, clearFiles, dragHandlers,
    handlePaste, fileInputRef, handleFileInputChange,
  } = useFileStaging()
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)

  if (!currentTicket) {
    return null
  }

  const ticket = currentTicket

  const handleDelete = async () => {
    await deleteCurrentTicket()
    onClose?.()
  }

  const handleEditClick = () => {
    setEditTitle(ticket.title)
    setEditBody(ticket.body ?? '')
    setEditStatus(ticket.status)
    setMode('edit')
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return
    await updateCurrentTicket({
      title: editTitle.trim(),
      body: editBody.trim() || undefined,
      status: editStatus,
    })
    if (hasFiles) {
      for (const file of stagedFiles) {
        try {
          await uploadTicketAttachment.mutateAsync({
            ticketId: ticket.id, file, uploadedById: 'user-1',
          })
        } catch {
          // Individual upload failures don't block remaining uploads
        }
      }
    }
    clearFiles()
    setMode('view')
  }

  const handleCancel = () => {
    clearFiles()
    setMode('view')
  }

  return (
    <Card className={cn('py-4 gap-3', className)}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {mode === 'view' ? (
              <>
                <div className="flex items-center gap-2 mb-1">
                  <StatusIndicator status={agentStatus} size="default" />
                  <span className="text-sm text-muted-foreground">#{ticket.id}</span>
                  {isEditable ? (
                    <Tabs
                      value={ticket.status}
                      onValueChange={(v) => updateCurrentTicket({ status: v as TicketStatus })}
                    >
                      <TabsList className="h-6 p-0.5">
                        {STATUS_OPTIONS.map((opt) => (
                          <TabsTrigger
                            key={opt.value}
                            value={opt.value}
                            disabled={isUpdating}
                            className={cn(
                              'h-5 px-2 py-0 text-xs',
                              ticket.status === opt.value && statusColors[opt.value]
                            )}
                          >
                            {opt.label}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </Tabs>
                  ) : (
                    <span
                      className={cn(
                        'px-2 py-0.5 text-xs rounded-full font-medium',
                        statusColors[ticket.status]
                      )}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  )}
                  {ticket.priority !== null && (
                    <>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{priorityLabels[ticket.priority]}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </span>
                </div>
                <CardTitle className="text-lg">{ticket.title}</CardTitle>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <StatusIndicator status={agentStatus} size="default" />
                  <span className="text-sm text-muted-foreground">#{ticket.id}</span>
                  <Tabs
                    value={editStatus}
                    onValueChange={(v) => setEditStatus(v as TicketStatus)}
                  >
                    <TabsList className="h-7 p-0.5">
                      {STATUS_OPTIONS.map((opt) => (
                        <TabsTrigger
                          key={opt.value}
                          value={opt.value}
                          className={cn(
                            'h-6 px-2 py-0 text-xs',
                            editStatus === opt.value && statusColors[opt.value]
                          )}
                        >
                          {opt.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Ticket title"
                  className="text-xl font-semibold"
                />
              </div>
            )}
            {ticketLabels.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {ticketLabels.map((label) => (
                  <LabelBadge
                    key={label.id}
                    label={label}
                    size="sm"
                    onRemove={
                      isEditable ? () => removeLabel(label.id, 'user-1') : undefined
                    }
                  />
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isEditable && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEditClick}
                  disabled={mode === 'edit'}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {mode === 'view' ? (
          <>
            {ticket.body && (
              <div className="text-sm text-muted-foreground">
                <Markdown projectId={currentProjectId}>{ticket.body}</Markdown>
              </div>
            )}
            {ticketAttachments && ticketAttachments.length > 0 && (
              <>
                <div className="flex flex-wrap gap-2 mt-2">
                  {ticketAttachments.map((attachment, index) => (
                    <button
                      key={attachment.id}
                      type="button"
                      onClick={() => {
                        setLightboxIndex(index)
                        setLightboxOpen(true)
                      }}
                      className="group block text-left cursor-pointer"
                    >
                      <img
                        src={attachmentsApi.downloadUrl(attachment.id)}
                        alt={attachment.filename}
                        className="max-h-48 rounded border object-cover transition-opacity group-hover:opacity-90"
                      />
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-48">
                        {attachment.filename}
                      </div>
                    </button>
                  ))}
                </div>
                <ImageLightbox
                  attachments={ticketAttachments}
                  initialIndex={lightboxIndex}
                  open={lightboxOpen}
                  onOpenChange={setLightboxOpen}
                />
              </>
            )}
          </>
        ) : (
          <div
            className={cn(
              'rounded transition-colors',
              isDragOver && 'ring-2 ring-primary/50 bg-primary/5',
            )}
            {...dragHandlers}
          >
            <Textarea
              ref={editBodyRef}
              value={editBody}
              onChange={autocompleteProps.onChange}
              onKeyDown={autocompleteProps.onKeyDown}
              onPaste={handlePaste}
              placeholder="Add a description..."
              className="min-h-[100px]"
            />
            <AutocompletePortal />
            <StagedFilePreviews stagedFiles={stagedFiles} previewUrls={previewUrls} onRemove={removeFile} className="mt-1" />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleFileInputChange}
            />
          </div>
        )}

        {ticket.external_url && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">External Link</h4>
            <a
              href={ticket.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {ticket.external_url}
            </a>
          </div>
        )}

        {isEditable && (
          <div className="pt-4 border-t">
            <h4 className="text-sm font-medium mb-2">Labels</h4>
            <LabelSelector
              availableLabels={projectLabels}
              selectedLabelIds={ticketLabels.map((l) => l.id)}
              onLabelAdd={(labelId) => addLabel(labelId, 'user-1')}
              onLabelRemove={(labelId) => removeLabel(labelId, 'user-1')}
              onLabelCreate={(data) => createLabel(data)}
              onLabelUpdate={(id, data) => updateLabel(id, data)}
              onLabelDelete={(id) => deleteLabel(id)}
              isCreating={isCreatingLabel}
              isUpdating={isUpdatingLabel}
              isDeleting={isDeletingLabel}
            />
          </div>
        )}

        {mode === 'edit' && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={isUpdating}>
              <Paperclip className="size-4" />
            </Button>
            <Button variant="ghost" onClick={handleCancel} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!editTitle.trim() || isUpdating}>
              {isUpdating ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export { TicketDetail }
