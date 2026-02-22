import { useState, useEffect, useRef } from 'react'
import type { TicketStatus, TicketPriority } from '@kombuse/types'
import { cn } from '../../lib/utils'
import { Button } from '../../base/button'
import { Input } from '../../base/input'
import { Textarea } from '../../base/textarea'
import { Switch } from '../../base/switch'
import { Tabs, TabsList, TabsTrigger } from '../../base/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../base/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../base/dialog'
import { X, Trash2, Pencil, Paperclip, ChevronDown, ChevronRight } from 'lucide-react'
import { LabelBadge } from '../labels/label-badge'
import { LabelSelector } from '../labels/label-selector'
import { MilestoneBadge } from '../milestones/milestone-badge'
import { MilestoneSelector } from '../milestones/milestone-selector'
import { StatusIndicator } from '../status-indicator'
import { Markdown } from '../markdown'
import { ImageLightbox } from '../image-lightbox'
import { attachmentsApi } from '../../lib/api'
import { useTicketOperations, useLabelOperations, useMilestoneOperations, useTicketAgentStatus, useCurrentProject, useTicketAttachments, useUploadTicketAttachment } from '../../hooks'
import { useTextareaAutocomplete } from '../../hooks/use-textarea-autocomplete'
import { useFileStaging } from '../../hooks/use-file-staging'
import { StagedFilePreviews } from '../staged-file-previews'

interface TicketDetailProps {
  className?: string
  onClose?: () => void
  isEditable?: boolean
  onEditModeChange?: (mode: 'view' | 'edit') => void
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

function getPriorityLabel(priority: number | null | undefined): string {
  if (priority == null) return 'No priority'
  return priorityLabels[priority] ?? 'No priority'
}

function priorityToSelectValue(priority: number | null | undefined): string {
  if (priority == null) return 'none'
  return String(priority)
}

function selectValueToPriority(value: string): TicketPriority | null {
  if (value === 'none') return null
  return Number(value) as TicketPriority
}

const PRIORITY_OPTIONS = [
  { value: 'none', label: 'No priority' },
  { value: '0', label: 'Lowest' },
  { value: '1', label: 'Low' },
  { value: '2', label: 'Medium' },
  { value: '3', label: 'High' },
  { value: '4', label: 'Highest' },
] as const

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'closed', label: 'Closed' },
]

function TicketDetail({ className, onClose, isEditable, onEditModeChange }: TicketDetailProps) {
  const { currentTicket, deleteCurrentTicket, updateCurrentTicket, isDeleting, isUpdating } =
    useTicketOperations()

  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editStatus, setEditStatus] = useState<TicketStatus>('open')
  const [editPriority, setEditPriority] = useState<string>('none')
  const editBodyRef = useRef<HTMLTextAreaElement>(null)
  const { textareaProps: autocompleteProps, AutocompletePortal } = useTextareaAutocomplete({
    value: editBody,
    onValueChange: setEditBody,
    textareaRef: editBodyRef,
    projectId: currentTicket?.project_id,
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

  const {
    projectMilestones,
    currentMilestone,
    createMilestone,
    isCreating: isCreatingMilestone,
  } = useMilestoneOperations()

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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Reset expanded state when switching tickets
  useEffect(() => {
    setDescriptionExpanded(false)
    setShowDeleteDialog(false)
  }, [currentTicket?.id])

  const shouldShowDescriptionToggle = (body: string | null) =>
    !!body && (body.length > 200 || body.includes('\n'))

  if (!currentTicket) {
    return null
  }

  const ticket = currentTicket
  const createdDate = new Date(ticket.created_at).toLocaleDateString()

  const handleDelete = async () => {
    try {
      await deleteCurrentTicket()
      setShowDeleteDialog(false)
      onClose?.()
    } catch {
      // Error toasts are handled by the app-level mutation cache.
    }
  }

  const handleEditClick = () => {
    setEditTitle(ticket.title)
    setEditBody(ticket.body ?? '')
    setEditStatus(ticket.status)
    setEditPriority(priorityToSelectValue(ticket.priority))
    setMode('edit')
    onEditModeChange?.('edit')
  }

  const handleSave = async () => {
    if (!editTitle.trim()) return
    await updateCurrentTicket({
      title: editTitle.trim(),
      body: editBody.trim() || undefined,
      status: editStatus,
      priority: selectValueToPriority(editPriority),
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
    onEditModeChange?.('view')
  }

  const handleCancel = () => {
    clearFiles()
    setMode('view')
    onEditModeChange?.('view')
  }

  return (
    <>
      {/* Sticky header — direct child of scroll container so sticky works correctly */}
      <div
        className={cn(
          'sticky top-0 z-20 border-b bg-card/95 px-4 py-3 shadow-md backdrop-blur-sm',
          className
        )}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            {mode === 'view' ? (
              <div className="min-h-[5.25rem] space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusIndicator status={agentStatus} size="default" />
                  <span className="text-sm text-muted-foreground">#{ticket.ticket_number}</span>
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
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        statusColors[ticket.status]
                      )}
                    >
                      {ticket.status.replace('_', ' ')}
                    </span>
                  )}
                  {isEditable ? (
                    <Select
                      value={priorityToSelectValue(ticket.priority)}
                      onValueChange={(v) =>
                        updateCurrentTicket({ priority: selectValueToPriority(v) })
                      }
                    >
                      <SelectTrigger
                        className="h-6 w-auto min-w-[7rem] gap-1 rounded-full border-0 px-2 text-xs shadow-none"
                        disabled={isUpdating}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PRIORITY_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Priority: {getPriorityLabel(ticket.priority)}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  <h1 className="text-lg font-semibold leading-tight tracking-tight">{ticket.title}</h1>
                  <p className="text-xs text-muted-foreground">Created {createdDate}</p>
                </div>
              </div>
            ) : (
              <div className="min-h-[5.25rem] space-y-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <StatusIndicator status={agentStatus} size="default" />
                  <span className="text-sm text-muted-foreground">#{ticket.ticket_number}</span>
                  <Tabs
                    value={editStatus}
                    onValueChange={(v) => setEditStatus(v as TicketStatus)}
                  >
                    <TabsList className="h-6 p-0.5">
                      {STATUS_OPTIONS.map((opt) => (
                        <TabsTrigger
                          key={opt.value}
                          value={opt.value}
                          className={cn(
                            'h-5 px-2 py-0 text-xs',
                            editStatus === opt.value && statusColors[opt.value]
                          )}
                        >
                          {opt.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <Select
                    value={editPriority}
                    onValueChange={setEditPriority}
                  >
                    <SelectTrigger className="h-6 w-auto min-w-[7rem] gap-1 rounded-full border-0 px-2 text-xs shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORITY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Ticket title"
                    className="h-9 text-lg font-semibold leading-tight"
                  />
                  <p className="text-xs text-muted-foreground">Created {createdDate}</p>
                </div>
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {ticketLabels.map((label) => (
                <LabelBadge
                  key={label.id}
                  label={label}
                  size="sm"
                  onRemove={isEditable ? () => removeLabel(label.id, 'user-1') : undefined}
                />
              ))}
              {isEditable && (
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
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {currentMilestone && !isEditable && (
                <MilestoneBadge milestone={currentMilestone} size="sm" showProgress />
              )}
              {isEditable && (
                <MilestoneSelector
                  availableMilestones={projectMilestones}
                  selectedMilestoneId={ticket.milestone_id ?? null}
                  onSelect={(milestoneId) => updateCurrentTicket({ milestone_id: milestoneId })}
                  onMilestoneCreate={(data) => createMilestone(data)}
                  isCreating={isCreatingMilestone}
                  showProgress
                />
              )}
            </div>
          </div>
          <div className="flex items-start gap-1">
            {isEditable && mode === 'view' && (
              <div className="mr-1 flex items-center gap-1.5 rounded-md border px-2 py-1">
                <Switch
                  checked={ticket.triggers_enabled}
                  onCheckedChange={(checked) => {
                    void updateCurrentTicket({ triggers_enabled: checked })
                  }}
                  disabled={isUpdating}
                  aria-label="Toggle ticket triggers"
                />
                <span className="text-xs text-muted-foreground">
                  {ticket.triggers_enabled ? 'Triggers on' : 'Triggers off'}
                </span>
              </div>
            )}
            {isEditable && mode === 'view' && ticket.loop_protection_tripped && (
              <div className="mr-1 flex items-center gap-1.5 rounded-md border px-2 py-1">
                <Switch
                  checked={ticket.loop_protection_enabled}
                  onCheckedChange={(checked) => {
                    void updateCurrentTicket({ loop_protection_enabled: checked })
                  }}
                  disabled={isUpdating}
                  aria-label="Toggle loop protection"
                />
                <span className="text-xs text-muted-foreground">
                  {ticket.loop_protection_enabled ? 'Loop guard on' : 'Loop guard off'}
                </span>
              </div>
            )}
            {isEditable && mode === 'edit' ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUpdating}
                  aria-label="Attach files"
                >
                  <Paperclip className="size-4" />
                </Button>
                <Button variant="ghost" onClick={handleCancel} disabled={isUpdating}>
                  Cancel
                </Button>
                <Button onClick={handleSave} disabled={!editTitle.trim() || isUpdating}>
                  {isUpdating ? 'Saving...' : 'Save'}
                </Button>
              </>
            ) : isEditable ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleEditClick}
                  aria-label="Edit ticket"
                >
                  <Pencil className="size-4" />
                </Button>
                <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete ticket"
                      disabled={isDeleting}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete ticket?</DialogTitle>
                      <DialogDescription>
                        This will permanently delete this ticket and all related comments and attachments.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setShowDeleteDialog(false)}
                        disabled={isDeleting}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={isDeleting}
                      >
                        {isDeleting ? 'Deleting...' : 'Delete'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </>
            ) : null}
            {onClose && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close ticket detail"
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content body — scrolls beneath the sticky header */}
      <div className="space-y-3 px-4 py-4 border-b">
        {mode === 'view' ? (
          <>
            {ticket.body && (
              <div className="text-sm text-muted-foreground">
                <div
                  className={cn(!descriptionExpanded && 'line-clamp-4')}
                >
                  <Markdown projectId={currentProjectId}>{ticket.body}</Markdown>
                </div>
                {shouldShowDescriptionToggle(ticket.body) && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                    className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                  >
                    {descriptionExpanded ? (
                      <>
                        <ChevronDown className="size-3" />
                        <span>Show less</span>
                      </>
                    ) : (
                      <>
                        <ChevronRight className="size-3" />
                        <span>Show more</span>
                      </>
                    )}
                  </button>
                )}
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
              autoResize
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

      </div>
    </>
  )
}

export { TicketDetail }
