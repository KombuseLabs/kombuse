import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
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
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@kombuse/ui/base";
import { TicketList, TicketDetail, ChatInput, ActivityTimeline, Chat } from "@kombuse/ui/components";
import type { ReplyTarget } from "@kombuse/ui/components";
import { ChatProvider } from "@kombuse/ui/providers";
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
  useUploadTicketAttachment,
  useTextareaAutocomplete,
  useMarkTicketViewed,
  useFileStaging,
  useScrollToBottom,
  useScrollToComment,
} from "@kombuse/ui/hooks";
import { LabelBadge, StagedFilePreviews } from "@kombuse/ui/components";
import { Plus, X, Save, ArrowUp, ArrowDown, Paperclip } from "lucide-react";
import type { Ticket, TicketStatus, TicketFilters, CommentWithAuthor } from "@kombuse/types";

const TICKETS_PANEL_LAYOUT_KEY = "tickets-panel-layout";

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
  const { setCurrentTicket, setView } = useAppContext();

  // Filter state synced to URL search params
  const [searchParams, setSearchParams] = useSearchParams();

  const validStatuses = new Set<string>(["all", "open", "closed", "in_progress", "blocked"]);
  const rawStatus = searchParams.get("status");
  const statusFilter: TicketStatus | "all" = rawStatus && validStatuses.has(rawStatus)
    ? (rawStatus as TicketStatus | "all")
    : "open";

  const { data: projectLabels } = useProjectLabels(projectId ?? "");

  const validSortByValues = new Set<TicketFilters["sort_by"]>(["created_at", "updated_at", "closed_at", "opened_at", "last_activity_at"]);
  const showClosedSort = statusFilter === "all" || statusFilter === "closed";
  const rawSortBy = searchParams.get("sort_by");
  const parsedSortBy = rawSortBy && validSortByValues.has(rawSortBy as TicketFilters["sort_by"])
    ? (rawSortBy as NonNullable<TicketFilters["sort_by"]>)
    : "created_at";
  const sortBy: NonNullable<TicketFilters["sort_by"]> = parsedSortBy === "closed_at" && !showClosedSort
    ? "created_at"
    : parsedSortBy;

  const rawSortOrder = searchParams.get("sort_order");
  const sortOrder: NonNullable<TicketFilters["sort_order"]> = rawSortOrder === "asc" ? "asc" : "desc";

  const selectedLabelIds: number[] = useMemo(() => {
    const raw = searchParams.get("labels");
    if (!raw || !projectLabels) return [];
    const names = raw.split(",").map((s) => s.trim().toLowerCase());
    return projectLabels
      .filter((l) => names.includes(l.name.toLowerCase()))
      .map((l) => l.id);
  }, [searchParams, projectLabels]);

  // Unfiltered query for counting tickets by status
  const { data: allTickets } = useTickets({ project_id: projectId });

  const { openCount, closedCount, inProgressCount, blockedCount } = useMemo(() => {
    if (!allTickets) return { openCount: 0, closedCount: 0, inProgressCount: 0, blockedCount: 0 };
    return {
      openCount: allTickets.filter((t) => t.status === "open").length,
      closedCount: allTickets.filter((t) => t.status === "closed").length,
      inProgressCount: allTickets.filter((t) => t.status === "in_progress").length,
      blockedCount: allTickets.filter((t) => t.status === "blocked").length,
    };
  }, [allTickets]);

  const {
    data: tickets,
    isLoading,
    error,
  } = useTickets({
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
    label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    viewer_id: "user-1", // TODO: Get from auth context
  });

  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
  } = useTicket(ticketId ? Number(ticketId) : 0);

  const createTicket = useCreateTicket();
  const markViewed = useMarkTicketViewed();
  const markViewedMutate = markViewed.mutate;

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

  // Scroll-to-comment for hash fragment navigation (e.g. #comment-144)
  const { highlightedCommentId, isScrollToCommentPending } = useScrollToComment({
    isTimelineLoaded: (timeline?.items.length ?? 0) > 0,
  });

  // Scroll-to-bottom for ticket detail (suppressed when scroll-to-comment is active)
  const { scrollRef: ticketScrollRef, isAtBottom: ticketIsAtBottom, isAtTop: ticketIsAtTop, scrollToBottom: ticketScrollToBottom, scrollToTop: ticketScrollToTop, onScroll: ticketOnScroll } = useScrollToBottom({
    deps: [timeline?.items.length],
    initialScrollOnChange: selectedTicket?.id,
    suppressInitialScroll: isScrollToCommentPending,
  });

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");
  const [newTicketTitle, setNewTicketTitle] = useState("");
  const [newTicketBody, setNewTicketBody] = useState("");
  const newTicketBodyRef = useRef<HTMLTextAreaElement>(null);
  const { textareaProps: newTicketAutocomplete, AutocompletePortal: NewTicketAutocomplete } = useTextareaAutocomplete({
    value: newTicketBody,
    onValueChange: setNewTicketBody,
    textareaRef: newTicketBodyRef,
  });
  const {
    stagedFiles: createStagedFiles, previewUrls: createPreviewUrls,
    isDragOver: createIsDragOver, hasFiles: createHasFiles,
    removeFile: createRemoveFile, clearFiles: createClearFiles,
    dragHandlers: createDragHandlers,
    handlePaste: createHandlePaste, fileInputRef: createFileInputRef,
    handleFileInputChange: createHandleFileInputChange,
  } = useFileStaging();
  const uploadTicketAttachment = useUploadTicketAttachment();

  // Reply state
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  // Chat panel state — session ID to display inline, persisted in URL
  const chatSessionId = searchParams.get('session');

  // Agent reply state — tracks active agent session for loading indicator
  const [agentReplySessionId, setAgentReplySessionId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const numericTicketId = ticketId ? Number(ticketId) : 0;

  // Subscribe to the agent session topic while a reply is in-flight
  const wsTopics = useMemo(
    () => (agentReplySessionId ? [`session:${agentReplySessionId}`] : []),
    [agentReplySessionId]
  );

  const handleAgentMessage = useCallback(
    (message: import("@kombuse/types").ServerMessage) => {
      if (message.type === "agent.complete") {
        if (!agentReplySessionId || message.kombuseSessionId === agentReplySessionId) {
          setAgentReplySessionId(null);
          // Safety-net invalidation in case the realtime event was missed
          if (numericTicketId > 0) {
            queryClient.invalidateQueries({ queryKey: ["ticket-timeline", numericTicketId] });
            queryClient.invalidateQueries({ queryKey: ["comments", numericTicketId], exact: false });
          }
        }
      }
    },
    [agentReplySessionId, numericTicketId, queryClient]
  );

  // WebSocket for sending agent.invoke messages and receiving completions
  const { send: wsSend } = useWebSocket({ topics: wsTopics, onMessage: handleAgentMessage });

  // Determine if we're in create mode
  const isCreating = ticketId === "new";

  // Resizable panel layout persistence
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const stored = localStorage.getItem(TICKETS_PANEL_LAYOUT_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        return undefined;
      }
    }
    return undefined;
  });

  const handleLayoutChanged = useCallback((layout: Record<string, number>) => {
    localStorage.setItem(TICKETS_PANEL_LAYOUT_KEY, JSON.stringify(layout));
  }, []);

  useEffect(() => {
    setView("tickets");
  }, [setView]);

  // Track last-viewed ticket to avoid redundant markViewed calls on reference changes
  const lastViewedTicketIdRef = useRef<number | null>(null);

  // Sync selected ticket to context and mark as viewed
  useEffect(() => {
    setCurrentTicket(selectedTicket ?? null);
    setReplyTarget(null);
    updateSearchParams({ session: null });
    setAgentReplySessionId(null);

    if (selectedTicket && selectedTicket.id > 0 && selectedTicket.id !== lastViewedTicketIdRef.current) {
      lastViewedTicketIdRef.current = selectedTicket.id;
      markViewedMutate({ id: selectedTicket.id, profileId: "user-1" }); // TODO: Get from auth context
    }
  }, [selectedTicket, setCurrentTicket, markViewedMutate]);

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
        newComment = await createComment(body, "user-1", replyTarget.commentId, targetComment.kombuse_session_id); // TODO: Get from auth context
        // Track loading state and invoke the agent session
        setAgentReplySessionId(targetComment.kombuse_session_id);
        wsSend({
          type: "agent.invoke",
          agentId: targetComment.author_id,
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
    navigate({ pathname: `/projects/${projectId}/tickets/new`, search: searchParams.toString() });
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
        onSuccess: async (newTicket) => {
          if (createHasFiles) {
            for (const file of createStagedFiles) {
              try {
                await uploadTicketAttachment.mutateAsync({
                  ticketId: newTicket.id, file, uploadedById: "user-1",
                });
              } catch {
                // Individual upload failures don't block remaining uploads
              }
            }
          }
          createClearFiles();
          setNewTicketTitle("");
          setNewTicketBody("");
          navigate({ pathname: `/projects/${projectId}/tickets/${newTicket.id}`, search: searchParams.toString() });
        },
      }
    );
  };

  const handleTicketClick = (ticket: Ticket) => {
    const params = new URLSearchParams(searchParams);
    params.delete('session');
    navigate({ pathname: `/projects/${projectId}/tickets/${ticket.id}`, search: params.toString() });
  };

  const handleCloseDetail = () => {
    navigate({ pathname: `/projects/${projectId}/tickets`, search: searchParams.toString() });
  };

  const updateSearchParams = useCallback((updates: Record<string, string | null>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }
      return next;
    });
  }, [setSearchParams]);

  const toggleLabelFilter = (labelId: number) => {
    const nextIds = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    const nextNames = projectLabels
      ?.filter((l) => nextIds.includes(l.id))
      .map((l) => l.name);
    updateSearchParams({ labels: nextNames?.length ? nextNames.join(",") : null });
  };

  const ticketListContent = (
    <>
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
    </>
  );

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
            {allTickets && (
              <span className="text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => updateSearchParams({ status: "all" })}
                  className={`hover:text-foreground transition-colors ${statusFilter === "all" ? "text-foreground font-medium" : ""}`}
                >
                  All
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => updateSearchParams({ status: statusFilter === "open" ? "all" : "open" })}
                  className={`hover:text-foreground transition-colors ${statusFilter === "open" ? "text-foreground font-medium" : ""}`}
                >
                  {openCount} Open
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => updateSearchParams({ status: statusFilter === "in_progress" ? "all" : "in_progress" })}
                  className={`hover:text-foreground transition-colors ${statusFilter === "in_progress" ? "text-foreground font-medium" : ""}`}
                >
                  {inProgressCount} In Progress
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => updateSearchParams({ status: statusFilter === "blocked" ? "all" : "blocked" })}
                  className={`hover:text-foreground transition-colors ${statusFilter === "blocked" ? "text-foreground font-medium" : ""}`}
                >
                  {blockedCount} Blocked
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => updateSearchParams({ status: statusFilter === "closed" ? "all" : "closed" })}
                  className={`hover:text-foreground transition-colors ${statusFilter === "closed" ? "text-foreground font-medium" : ""}`}
                >
                  {closedCount} Closed
                </button>
              </span>
            )}
            <Select
              value={sortBy}
              onValueChange={(value) => updateSearchParams({ sort_by: value === "created_at" ? null : value })}
            >
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at">Created</SelectItem>
                <SelectItem value="updated_at">Updated</SelectItem>
                <SelectItem value="opened_at">Opened</SelectItem>
                <SelectItem value="last_activity_at">Activity</SelectItem>
                {showClosedSort && (
                  <SelectItem value="closed_at">Closed</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => updateSearchParams({ sort_order: sortOrder === "desc" ? "asc" : null })}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              {sortOrder === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
            </Button>
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
                onClick={() => updateSearchParams({ labels: null })}
                className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {ticketId ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={50} minSize={25}>
              <div className="overflow-y-auto p-6 h-full">
                {ticketListContent}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25}>
              <div className="flex flex-col h-full">
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
                        <div
                          className={`rounded transition-colors ${createIsDragOver ? "ring-2 ring-primary/50 bg-primary/5" : ""}`}
                          {...createDragHandlers}
                        >
                          <Textarea
                            id="new-ticket-body"
                            ref={newTicketBodyRef}
                            value={newTicketBody}
                            onChange={newTicketAutocomplete.onChange}
                            onKeyDown={newTicketAutocomplete.onKeyDown}
                            onPaste={createHandlePaste}
                            placeholder="Describe the ticket..."
                            className="min-h-32"
                          />
                          <NewTicketAutocomplete />
                          <StagedFilePreviews stagedFiles={createStagedFiles} previewUrls={createPreviewUrls} onRemove={createRemoveFile} className="mt-1" />
                          <input
                            ref={createFileInputRef}
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={createHandleFileInputChange}
                          />
                        </div>
                      </div>

                      {/* Create Button */}
                      <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="ghost" size="icon" onClick={() => createFileInputRef.current?.click()} disabled={createTicket.isPending}>
                          <Paperclip className="size-4" />
                        </Button>
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
                      <div className="relative flex flex-col flex-1 min-h-0">
                        {/* Scrollable area: ticket detail + comments */}
                        <div ref={ticketScrollRef} onScroll={ticketOnScroll} className="flex-1 overflow-y-auto">
                          <TicketDetail
                            onClose={handleCloseDetail}
                            isEditable
                          />

                          {/* Activity Timeline */}
                          <div className="mt-6 px-4 pb-4">
                            <h3 className="text-sm font-medium mb-4">
                              Activity {timeline?.total ? `(${timeline.total})` : ""}
                            </h3>

                            <ActivityTimeline
                              items={timeline?.items ?? []}
                              projectId={projectId}
                              attachmentsByCommentId={attachmentsByCommentId}
                              highlightedCommentId={highlightedCommentId}
                              editingCommentId={editingCommentId}
                              editBody={editBody}
                              onEditBodyChange={setEditBody}
                              onStartEditComment={(comment) => {
                                setEditingCommentId(comment.id);
                                setEditBody(comment.body);
                              }}
                              onSaveEditComment={async (stagedFiles?: File[]) => {
                                if (editingCommentId) {
                                  await updateComment(editingCommentId, editBody);
                                  if (stagedFiles?.length) {
                                    for (const file of stagedFiles) {
                                      try {
                                        await uploadAttachment.mutateAsync({
                                          commentId: editingCommentId,
                                          file,
                                          uploadedById: "user-1", // TODO: Get from auth context
                                        });
                                      } catch {
                                        // Individual upload failures don't block remaining uploads
                                      }
                                    }
                                  }
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
                              onSessionClick={(sessionId) => updateSearchParams({ session: sessionId })}
                              isUpdatingComment={isUpdatingComment}
                              isDeletingComment={isDeletingComment}
                            />
                          </div>
                        </div>

                        {/* Floating scroll navigation buttons */}
                        {(!ticketIsAtTop || !ticketIsAtBottom) && (
                          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-10">
                            {!ticketIsAtTop && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="rounded-full shadow-md h-8 w-8 opacity-80 hover:opacity-100 transition-opacity"
                                onClick={ticketScrollToTop}
                                aria-label="Scroll to top"
                              >
                                <ArrowUp className="h-4 w-4" />
                              </Button>
                            )}
                            {!ticketIsAtBottom && (
                              <Button
                                variant="outline"
                                size="icon"
                                className="rounded-full shadow-md h-8 w-8 opacity-80 hover:opacity-100 transition-opacity"
                                onClick={ticketScrollToBottom}
                                aria-label="Scroll to bottom"
                              >
                                <ArrowDown className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Fixed ChatInput at bottom */}
                        <div className="border-t p-4">
                          {agentReplySessionId && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2 animate-pulse">
                              <span className="inline-block size-2 rounded-full bg-primary" />
                              Agent is thinking...
                            </div>
                          )}
                          <ChatInput
                            onSubmit={handleAddComment}
                            isLoading={isCreatingComment}
                            placeholder="Add a comment..."
                            replyTarget={replyTarget}
                            onCancelReply={handleCancelReply}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </ResizablePanel>

            {chatSessionId && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="chat" defaultSize={40} minSize={25}>
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
                      <h3 className="text-sm font-medium">Session</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6"
                        onClick={() => updateSearchParams({ session: null })}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <ChatProvider
                        key={chatSessionId}
                        sessionId={chatSessionId}
                        projectId={projectId ?? null}
                      >
                        <Chat
                          emptyMessage="Loading session..."
                          className="h-full"
                        />
                      </ChatProvider>
                    </div>
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        ) : (
          <div className="w-full overflow-y-auto p-6">
            {ticketListContent}
          </div>
        )}
      </div>

    </div>
  );
}
