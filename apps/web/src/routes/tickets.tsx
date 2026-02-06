import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Button,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@kombuse/ui/base";
import { TicketList, TicketDetail, ChatInput, ActivityTimeline } from "@kombuse/ui/components";
import type { ReplyTarget } from "@kombuse/ui/components";
import {
  useTickets,
  useTicket,
  useCreateTicket,
  useAppContext,
  useCommentOperations,
  useRealtimeUpdates,
  useProjectLabels,
  useTicketTimeline,
  useWebSocket,
  useCommentsAttachments,
  useUploadAttachment,
} from "@kombuse/ui/hooks";
import { LabelBadge } from "@kombuse/ui/components";
import { Plus, X, Save } from "lucide-react";
import type { Ticket, TicketStatus, CommentWithAuthor } from "@kombuse/types";

export function Tickets() {
  const { projectId, ticketId } = useParams<{
    projectId: string;
    ticketId?: string;
  }>();
  const navigate = useNavigate();

  // Real-time updates via WebSocket
  useRealtimeUpdates({
    projectId,
    ticketId: ticketId ? Number(ticketId) : undefined,
  });

  // Sync route params to app context
  const { setCurrentTicket, setCurrentProjectId, setView } = useAppContext();

  // Filter state - must be declared before useTickets
  const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("open");
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>([]);

  const { data: projectLabels } = useProjectLabels(projectId ?? "");

  const {
    data: tickets,
    isLoading,
    error,
  } = useTickets({
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
    label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
  });

  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
  } = useTicket(ticketId ? Number(ticketId) : 0);

  const createTicket = useCreateTicket();

  // Comment operations from context-aware hook
  const {
    createComment,
    updateComment,
    deleteComment,
    isCreating: isCreatingComment,
    isUpdating: isUpdatingComment,
    isDeleting: isDeletingComment,
  } = useCommentOperations();

  // Unified timeline of comments + events
  const { data: timeline } = useTicketTimeline(ticketId ? Number(ticketId) : 0);

  // Fetch attachments for all comments in the timeline
  const commentIds = useMemo(
    () =>
      (timeline?.items ?? [])
        .filter((item) => item.type === "comment")
        .map((item) => (item.data as CommentWithAuthor).id),
    [timeline?.items]
  );
  const attachmentsByCommentId = useCommentsAttachments(commentIds);
  const uploadAttachment = useUploadAttachment();

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketBody, setNewTicketBody] = useState("");

  // Reply state
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  // WebSocket for sending agent.invoke messages
  const { send: wsSend } = useWebSocket({ topics: [] });

  // Determine if we're in create mode
  const isCreating = ticketId === "new";

  // Sync project ID to context
  useEffect(() => {
    setCurrentProjectId(projectId ?? null);
    setView("tickets");
  }, [projectId, setCurrentProjectId, setView]);

  // Sync selected ticket to context
  useEffect(() => {
    setCurrentTicket(selectedTicket ?? null);
    setReplyTarget(null);
  }, [selectedTicket, setCurrentTicket]);

  const handleReplyToComment = useCallback((comment: CommentWithAuthor) => {
    setReplyTarget({
      commentId: comment.id,
      authorId: comment.author_id,
      isAgentSession: !!comment.kombuse_session_id,
    });
  }, []);

  const handleCancelReply = useCallback(() => {
    setReplyTarget(null);
  }, []);

  const handleAddComment = async (body: string, files?: File[]) => {
    let newComment: CommentWithAuthor | undefined;

    if (replyTarget?.isAgentSession) {
      // Find the original comment to get its kombuse_session_id
      const targetComment = timeline?.items
        .filter((item): item is typeof item & { type: 'comment' } => item.type === 'comment')
        .map((item) => item.data as CommentWithAuthor)
        .find((c) => c.id === replyTarget.commentId);

      if (targetComment?.kombuse_session_id) {
        // Create the reply comment so it appears in timeline immediately
        newComment = await createComment(body, "user-1", replyTarget.commentId); // TODO: Get from auth context
        // Also invoke the agent session
        wsSend({
          type: "agent.invoke",
          message: body,
          kombuseSessionId: targetComment.kombuse_session_id,
        });
      } else {
        // Fallback to a threaded reply if the session can't be resolved
        newComment = await createComment(body, "user-1", replyTarget.commentId); // TODO: Get from auth context
      }
    } else if (replyTarget) {
      // Threaded reply to a user comment
      newComment = await createComment(body, "user-1", replyTarget.commentId); // TODO: Get from auth context
    } else {
      // Top-level comment
      newComment = await createComment(body || "(attachment)", "user-1"); // TODO: Get from auth context
    }

    // Upload files to the newly created comment
    if (newComment && files?.length) {
      for (const file of files) {
        try {
          await uploadAttachment.mutateAsync({
            commentId: newComment.id,
            file,
            uploadedById: "user-1", // TODO: Get from auth context
          });
        } catch {
          // Individual upload failures don't block remaining uploads
        }
      }
    }

    setReplyTarget(null);
  };

  const handleStartCreate = () => {
    setNewTicketTitle("");
    setNewTicketBody("");
    navigate(`/projects/${projectId}/tickets/new`);
  };

  const handleCreateTicket = () => {
    if (!projectId || !newTicketTitle.trim()) return;
    createTicket.mutate(
      {
        title: newTicketTitle.trim(),
        body: newTicketBody.trim() || undefined,
        project_id: projectId,
        author_id: "user-1", // TODO: Get from auth context
      },
      {
        onSuccess: (newTicket) => {
          setNewTicketTitle("");
          setNewTicketBody("");
          navigate(`/projects/${projectId}/tickets/${newTicket.id}`);
        },
      }
    );
  };

  const handleTicketClick = (ticket: Ticket) => {
    navigate(`/projects/${projectId}/tickets/${ticket.id}`);
  };

  const handleCloseDetail = () => {
    navigate(`/projects/${projectId}/tickets`);
  };

  const toggleLabelFilter = (labelId: number) => {
    setSelectedLabelIds((prev) =>
      prev.includes(labelId)
        ? prev.filter((id) => id !== labelId)
        : [...prev, labelId]
    );
  };

  if (!projectId) {
    return (
      <main className="flex flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">No project selected</p>
        <Link to="/projects" className="text-primary hover:underline mt-2">
          Go to projects
        </Link>
      </main>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col gap-3 p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Tickets</h1>
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as TicketStatus | "all")}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleStartCreate} disabled={isCreating}>
            <Plus className="size-4" />
            Create Ticket
          </Button>
        </div>
        {projectLabels && projectLabels.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Labels:</span>
            {projectLabels.map((label) => (
              <button
                key={label.id}
                type="button"
                onClick={() => toggleLabelFilter(label.id)}
                className={`transition-opacity ${
                  selectedLabelIds.length > 0 && !selectedLabelIds.includes(label.id)
                    ? "opacity-40 hover:opacity-70"
                    : ""
                }`}
              >
                <LabelBadge label={label} size="sm" />
              </button>
            ))}
            {selectedLabelIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedLabelIds([])}
                className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Ticket List */}
        <div
          className={`${
            ticketId ? "w-1/2 border-r" : "w-full"
          } overflow-y-auto p-6`}
        >
          {isLoading && (
            <div className="text-center py-8 text-muted-foreground">
              Loading tickets...
            </div>
          )}

          {error && (
            <div className="text-center py-8 text-destructive">
              Error: {error.message}
            </div>
          )}

          {!isLoading && !error && tickets && (
            <TicketList
              tickets={tickets}
              selectedTicketId={ticketId ? Number(ticketId) : undefined}
              onTicketClick={handleTicketClick}
            />
          )}
        </div>

        {/* Detail Panel - Create or View */}
        {ticketId && (
          <div className="w-1/2 flex flex-col">
            {isCreating ? (
              // Create Form
              <Card className="h-full flex flex-col">
                <CardHeader className="pb-4 shrink-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-lg bg-muted flex items-center justify-center">
                        <Plus className="size-6" />
                      </div>
                      <CardTitle className="text-xl">New Ticket</CardTitle>
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleCloseDetail}>
                      <X className="size-4" />
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="flex-1 overflow-y-auto space-y-6">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="new-ticket-title">Title *</Label>
                    <Input
                      id="new-ticket-title"
                      value={newTicketTitle}
                      onChange={(e) => setNewTicketTitle(e.target.value)}
                      placeholder="Ticket title"
                      autoFocus
                    />
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <Label htmlFor="new-ticket-body">Description</Label>
                    <Textarea
                      id="new-ticket-body"
                      value={newTicketBody}
                      onChange={(e) => setNewTicketBody(e.target.value)}
                      placeholder="Describe the ticket..."
                      className="min-h-32"
                    />
                  </div>

                  {/* Create Button */}
                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button variant="outline" onClick={handleCloseDetail}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleCreateTicket}
                      disabled={createTicket.isPending || !newTicketTitle.trim()}
                    >
                      <Save className="size-4 mr-2" />
                      {createTicket.isPending ? "Creating..." : "Create Ticket"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              // View existing ticket
              <>
                {isLoadingTicket && (
                  <div className="text-center py-8 text-muted-foreground">
                    Loading ticket...
                  </div>
                )}

                {selectedTicket && (
                  <>
                    {/* Scrollable area: ticket detail + comments */}
                    <div className="flex-1 overflow-y-auto p-4">
                      <TicketDetail
                        onClose={handleCloseDetail}
                        isEditable
                      />

                      {/* Activity Timeline */}
                      <div className="mt-6">
                        <h3 className="text-sm font-medium mb-4">
                          Activity {timeline?.total ? `(${timeline.total})` : ""}
                        </h3>

                        <ActivityTimeline
                          items={timeline?.items ?? []}
                          projectId={projectId}
                          attachmentsByCommentId={attachmentsByCommentId}
                          editingCommentId={editingCommentId}
                          editBody={editBody}
                          onEditBodyChange={setEditBody}
                          onStartEditComment={(comment) => {
                            setEditingCommentId(comment.id);
                            setEditBody(comment.body);
                          }}
                          onSaveEditComment={async () => {
                            if (editingCommentId) {
                              await updateComment(editingCommentId, editBody);
                              setEditingCommentId(null);
                              setEditBody("");
                            }
                          }}
                          onCancelEditComment={() => {
                            setEditingCommentId(null);
                            setEditBody("");
                          }}
                          onDeleteComment={deleteComment}
                          onReplyComment={handleReplyToComment}
                          isUpdatingComment={isUpdatingComment}
                          isDeletingComment={isDeletingComment}
                        />
                      </div>
                    </div>

                    {/* Fixed ChatInput at bottom */}
                    <div className="border-t p-4">
                      <ChatInput
                        onSubmit={handleAddComment}
                        isLoading={isCreatingComment}
                        placeholder="Add a comment..."
                        replyTarget={replyTarget}
                        onCancelReply={handleCancelReply}
                      />
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

    </div>
  );
}
