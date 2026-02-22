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
  Switch,
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  toast,
} from "@kombuse/ui/base";
import { TicketList, TicketListHeader, TicketDetail, ChatInput, ActivityTimeline, Chat } from "@kombuse/ui/components";
import type { ReplyTarget } from "@kombuse/ui/components";
import { ChatProvider } from "@kombuse/ui/providers";
import {
  useTickets,
  useTicketByNumber,
  useCreateTicket,
  useAppContext,
  useCommentOperations,
  useRealtimeUpdates,
  useProjectLabels,
  useProjectMilestones,
  useTicketTimeline,
  useWebSocket,
  useCommentsAttachments,
  useUploadAttachment,
  useUploadTicketAttachment,
  useTextareaAutocomplete,
  useMarkTicketViewed,
  useTicketStatusCounts,
  useFileStaging,
  useSessions,
  useScrollToBottom,
  useScrollToComment,
} from "@kombuse/ui/hooks";
import { LabelBadge, MilestoneBadge, StagedFilePreviews } from "@kombuse/ui/components";
import { Plus, X, Save, ArrowUp, ArrowDown, Paperclip, Check, ChevronsUpDown } from "lucide-react";
import type { Ticket, TicketStatus, TicketFilters, CommentWithAuthor } from "@kombuse/types";
import { sessionsApi } from "@kombuse/ui/lib/api";

const TICKETS_PANEL_LAYOUT_KEY = "tickets-panel-layout";

export function Tickets() {
  const { projectId, ticketNumber: ticketNumberParam } = useParams<{
    projectId: string;
    ticketNumber?: string;
  }>();
  const navigate = useNavigate();

  // Sync route params to app context
  const { setCurrentTicket, setView } = useAppContext();

  // Filter state synced to URL search params
  const [searchParams, setSearchParams] = useSearchParams();
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

  const validStatuses = new Set<string>(["all", "open", "closed", "in_progress", "blocked"]);
  const rawStatus = searchParams.get("status");
  const statusFilter: TicketStatus | "all" = rawStatus && validStatuses.has(rawStatus)
    ? (rawStatus as TicketStatus | "all")
    : "open";

  const { data: projectLabels } = useProjectLabels(projectId ?? "", {
    sort: "usage",
    usage_scope: "open",
  });
  const { data: projectMilestones } = useProjectMilestones(projectId ?? "");

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
    if (!raw) return [];

    const uniqueIds = new Set<number>();
    for (const token of raw.split(",")) {
      const id = Number.parseInt(token.trim(), 10);
      if (Number.isInteger(id) && id > 0) {
        uniqueIds.add(id);
      }
    }
    return [...uniqueIds];
  }, [searchParams]);

  const selectedMilestoneId: number | null = useMemo(() => {
    const raw = searchParams.get("milestone");
    if (!raw) return null;
    const id = parseInt(raw, 10);
    return Number.isInteger(id) && id > 0 ? id : null;
  }, [searchParams]);

  const usageSortedLabels = useMemo(() => {
    if (!projectLabels) return [];
    return [...projectLabels].sort((a, b) => {
      const usageDiff = (b.usage_count ?? 0) - (a.usage_count ?? 0);
      if (usageDiff !== 0) return usageDiff;
      return a.name.localeCompare(b.name);
    });
  }, [projectLabels]);

  // Server-side status counts (not affected by pagination limits)
  const { data: statusCounts } = useTicketStatusCounts(projectId);
  const openCount = statusCounts?.open ?? 0;
  const closedCount = statusCounts?.closed ?? 0;
  const inProgressCount = statusCounts?.in_progress ?? 0;
  const blockedCount = statusCounts?.blocked ?? 0;

  const {
    data: tickets,
    isLoading,
    error,
  } = useTickets({
    project_id: projectId,
    status: statusFilter === "all" ? undefined : statusFilter,
    label_ids: selectedLabelIds.length > 0 ? selectedLabelIds : undefined,
    milestone_id: selectedMilestoneId ?? undefined,
    sort_by: sortBy,
    sort_order: sortOrder,
    viewer_id: "user-1", // TODO: Get from auth context
  });

  const ticketNumber = ticketNumberParam && ticketNumberParam !== 'new' ? Number(ticketNumberParam) : 0;
  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
  } = useTicketByNumber(projectId, ticketNumber);
  const selectedTicketDbId = selectedTicket?.id ?? 0;

  // Real-time updates via WebSocket
  useRealtimeUpdates({
    projectId,
    ticketNumber: ticketNumber || undefined,
  });

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
  const { data: timeline, isFetched: isTimelineFetched } = useTicketTimeline(projectId ?? '', ticketNumber);

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
  // Fetch sessions for this ticket to compute Resume/Rerun eligibility
  const { data: ticketSessions } = useSessions(
    selectedTicketDbId > 0 ? { ticket_id: selectedTicketDbId } : undefined
  );
  const resumableSessionIds = useMemo(() => {
    if (!ticketSessions) return new Set<string>();
    // Most recent session per agent (sessions come sorted by updated_at DESC)
    const latestPerAgent = new Map<string, string>();
    for (const session of ticketSessions) {
      if (session.agent_id && session.kombuse_session_id && !latestPerAgent.has(session.agent_id)) {
        latestPerAgent.set(session.agent_id, session.kombuse_session_id);
      }
    }
    return new Set(latestPerAgent.values());
  }, [ticketSessions]);

  // Scroll-to-comment for hash fragment navigation (e.g. #comment-144)
  const { highlightedCommentId, isScrollToCommentPending } = useScrollToComment({
    isTimelineLoaded: Boolean(selectedTicket && isTimelineFetched),
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
  const [newTicketTriggersEnabled, setNewTicketTriggersEnabled] = useState(true);
  const [overflowLabelsOpen, setOverflowLabelsOpen] = useState(false);
  const [overflowLabelSearch, setOverflowLabelSearch] = useState("");
  const [visibleLabelCount, setVisibleLabelCount] = useState(0);
  const labelsRowRef = useRef<HTMLDivElement>(null);
  const labelMeasureMoreRef = useRef<HTMLButtonElement>(null);
  const labelMeasureClearRef = useRef<HTMLSpanElement>(null);
  const labelMeasureRefs = useRef(new Map<number, HTMLSpanElement>());
  const newTicketBodyRef = useRef<HTMLTextAreaElement>(null);
  const { textareaProps: newTicketAutocomplete, AutocompletePortal: NewTicketAutocomplete } = useTextareaAutocomplete({
    value: newTicketBody,
    onValueChange: setNewTicketBody,
    textareaRef: newTicketBodyRef,
    projectId,
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
          if (projectId && ticketNumber) {
            queryClient.invalidateQueries({ queryKey: ["ticket-timeline", projectId, ticketNumber] });
            queryClient.invalidateQueries({ queryKey: ["comments", projectId, ticketNumber], exact: false });
          }
        }
      }
    },
    [agentReplySessionId, projectId, ticketNumber, queryClient]
  );

  // WebSocket for sending agent.invoke messages and receiving completions
  const { send: wsSend } = useWebSocket({ topics: wsTopics, onMessage: handleAgentMessage });

  // Determine if we're in create mode
  const isCreating = ticketNumberParam === "new";

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

  const setLabelMeasureRef = useCallback((labelId: number, node: HTMLSpanElement | null) => {
    if (node) {
      labelMeasureRefs.current.set(labelId, node);
      return;
    }
    labelMeasureRefs.current.delete(labelId);
  }, []);

  useEffect(() => {
    if (usageSortedLabels.length === 0) {
      setVisibleLabelCount(0);
      return;
    }

    const container = labelsRowRef.current;
    if (!container) return;

    const calculateVisibleCount = () => {
      const availableWidth = container.clientWidth;
      if (availableWidth <= 0) {
        return;
      }

      const gap = 8;
      const hasSelectedLabels = selectedLabelIds.length > 0;
      const clearWidth = hasSelectedLabels ? (labelMeasureClearRef.current?.offsetWidth ?? 0) : 0;
      const moreWidth = labelMeasureMoreRef.current?.offsetWidth ?? 0;
      const labelWidths = usageSortedLabels.map((label) => labelMeasureRefs.current.get(label.id)?.offsetWidth ?? 0);
      const prefixLabelWidths: number[] = [0];

      for (let index = 0; index < labelWidths.length; index += 1) {
        prefixLabelWidths[index + 1] = prefixLabelWidths[index] + labelWidths[index];
      }

      let nextVisibleCount = 0;
      for (let candidateCount = usageSortedLabels.length; candidateCount >= 0; candidateCount -= 1) {
        const hasOverflow = candidateCount < usageSortedLabels.length;
        const renderedItemCount = candidateCount + (hasOverflow ? 1 : 0) + (hasSelectedLabels ? 1 : 0);
        const totalGapWidth = gap * Math.max(0, renderedItemCount - 1);
        const totalWidth = prefixLabelWidths[candidateCount]
          + (hasOverflow ? moreWidth : 0)
          + (hasSelectedLabels ? clearWidth : 0)
          + totalGapWidth;

        if (totalWidth <= availableWidth) {
          nextVisibleCount = candidateCount;
          break;
        }
      }

      setVisibleLabelCount(nextVisibleCount);
    };

    let secondRafId: number | undefined;
    const rafId = window.requestAnimationFrame(() => {
      calculateVisibleCount();
      secondRafId = window.requestAnimationFrame(calculateVisibleCount);
    });
    if (typeof ResizeObserver === "undefined") {
      return () => {
        window.cancelAnimationFrame(rafId);
        if (secondRafId !== undefined) window.cancelAnimationFrame(secondRafId);
      };
    }

    const resizeObserver = new ResizeObserver(calculateVisibleCount);
    resizeObserver.observe(container);

    return () => {
      window.cancelAnimationFrame(rafId);
      if (secondRafId !== undefined) window.cancelAnimationFrame(secondRafId);
      resizeObserver.disconnect();
    };
  }, [selectedLabelIds.length, usageSortedLabels, ticketNumberParam]);

  useEffect(() => {
    if (!overflowLabelsOpen) {
      setOverflowLabelSearch("");
    }
  }, [overflowLabelsOpen]);

  useEffect(() => {
    setView("tickets");
  }, [setView]);

  // Track last-viewed ticket to avoid redundant markViewed calls on reference changes
  const lastViewedTicketIdRef = useRef<number | null>(null);
  // Track ticket route changes so we only reset UI state when switching tickets.
  const lastRouteTicketNumberRef = useRef<string | undefined>(ticketNumberParam);

  // Reset per-ticket local UI state only when the route ticket actually changes.
  useEffect(() => {
    if (lastRouteTicketNumberRef.current !== ticketNumberParam) {
      setReplyTarget(null);
      setAgentReplySessionId(null);
      lastRouteTicketNumberRef.current = ticketNumberParam;
    }
  }, [ticketNumberParam]);

  // Sync selected ticket to context and mark as viewed
  useEffect(() => {
    setCurrentTicket(selectedTicket ?? null);

    if (selectedTicket && selectedTicket.id > 0 && selectedTicket.id !== lastViewedTicketIdRef.current) {
      lastViewedTicketIdRef.current = selectedTicket.id;
      markViewedMutate({ projectId: selectedTicket.project_id, ticketNumber: selectedTicket.ticket_number, profileId: "user-1" }); // TODO: Get from auth context
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

  const handleResumeAgent = useCallback((kombuseSessionId: string, agentId: string) => {
    setAgentReplySessionId(kombuseSessionId);
    wsSend({
      type: "agent.invoke",
      agentId,
      message: "continue",
      kombuseSessionId,
    });
  }, [wsSend]);

  const handleRerunAgent = useCallback(async (kombuseSessionId: string, agentId: string) => {
    try {
      const result = await sessionsApi.getEvents(kombuseSessionId, { event_type: "message", limit: 10 });
      const firstUserEvent = result.events.find(
        (e: { event_type: string; payload?: Record<string, unknown> }) =>
          e.event_type === "message" && e.payload?.role === "user"
      );
      const originalPrompt = typeof firstUserEvent?.payload?.content === "string"
        ? firstUserEvent.payload.content
        : null;

      if (!originalPrompt) {
        toast.error("Could not find the original prompt to replay.");
        return;
      }

      // Send without kombuseSessionId so server creates a new session
      wsSend({
        type: "agent.invoke",
        agentId,
        message: originalPrompt,
        ticketNumber: selectedTicket?.ticket_number,
        projectId: selectedTicket?.project_id,
      });
    } catch {
      toast.error("Failed to fetch session history for rerun.");
    }
  }, [wsSend, selectedTicket]);

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

    if (
      selectedTicket?.triggers_enabled === false &&
      /@\[[^\]]+\]\([^)]+\)/.test(body)
    ) {
      toast.warning(
        "Triggers are off for this ticket — mentioned agents won't be invoked."
      );
    }

    setReplyTarget(null);
  };

  const handleStartCreate = () => {
    setNewTicketTitle("");
    setNewTicketBody("");
    setNewTicketTriggersEnabled(true);
    const params = new URLSearchParams(searchParams);
    params.delete('session');
    navigate({ pathname: `/projects/${projectId}/tickets/new`, search: params.toString() });
  };

  const handleCreateTicket = () => {
    if (!projectId || !newTicketTitle.trim()) return;
    createTicket.mutate(
      {
        title: newTicketTitle.trim(),
        body: newTicketBody.trim() || undefined,
        triggers_enabled: newTicketTriggersEnabled,
        project_id: projectId,
        author_id: "user-1", // TODO: Get from auth context
      },
      {
        onSuccess: async (newTicket) => {
          if (createHasFiles) {
            for (const file of createStagedFiles) {
              try {
                await uploadTicketAttachment.mutateAsync({
                  projectId: newTicket.project_id, ticketNumber: newTicket.ticket_number, file, uploadedById: "user-1",
                });
              } catch {
                // Individual upload failures don't block remaining uploads
              }
            }
          }
          createClearFiles();
          setNewTicketTitle("");
          setNewTicketBody("");
          setNewTicketTriggersEnabled(true);
          const params = new URLSearchParams(searchParams);
          params.delete('session');
          navigate({ pathname: `/projects/${projectId}/tickets/${newTicket.ticket_number}`, search: params.toString() });
        },
      }
    );
  };

  const handleTicketClick = (ticket: Ticket) => {
    const params = new URLSearchParams(searchParams);
    params.delete('session');
    navigate({ pathname: `/projects/${projectId}/tickets/${ticket.ticket_number}`, search: params.toString() });
  };

  const handleCloseDetail = () => {
    navigate({ pathname: `/projects/${projectId}/tickets`, search: searchParams.toString() });
  };

  const toggleLabelFilter = (labelId: number) => {
    const nextIds = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((id) => id !== labelId)
      : [...selectedLabelIds, labelId];
    const serializedIds = nextIds.length > 0
      ? [...new Set(nextIds)].sort((a, b) => a - b).join(",")
      : null;
    updateSearchParams({ labels: serializedIds });
  };

  const visibleLabels = usageSortedLabels.slice(0, visibleLabelCount);
  const overflowLabels = usageSortedLabels.slice(visibleLabelCount);
  const filteredOverflowLabels = overflowLabels.filter((label) => {
    if (!overflowLabelSearch.trim()) return true;
    return label.name.toLowerCase().includes(overflowLabelSearch.toLowerCase());
  });
  const overflowSelectedCount = overflowLabels.filter((label) => selectedLabelIds.includes(label.id)).length;
  const ticketListContent = (
    <div className="relative h-full min-h-0">
      <TicketList
        tickets={!isLoading && !error && tickets ? tickets : []}
        className="h-full min-h-0"
        sortBy={sortBy}
        emptyMessage={isLoading ? "Loading tickets..." : error ? `Error: ${error.message}` : "No tickets found"}
        selectedTicketNumber={ticketNumber || undefined}
        onTicketClick={handleTicketClick}
        header={(
          <TicketListHeader
            title="Tickets"
            meta={
              statusCounts ? (
                <span>
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
              ) : null
            }
            controls={(
              <Button onClick={handleStartCreate} disabled={isCreating}>
                <Plus className="size-4" />
                Create Ticket
              </Button>
            )}
            filters={(
              <>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Sort:</span>
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
                {usageSortedLabels.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">Labels</span>
                    <div
                      ref={labelsRowRef}
                      data-testid="ticket-label-filters-row"
                      className="flex min-w-0 items-center gap-2 overflow-hidden"
                    >
                      {visibleLabels.map((label) => (
                        <button
                          key={label.id}
                          type="button"
                          onClick={() => toggleLabelFilter(label.id)}
                          className={`shrink-0 transition-opacity ${
                            selectedLabelIds.length > 0 && !selectedLabelIds.includes(label.id)
                              ? "opacity-40 hover:opacity-70"
                              : ""
                          }`}
                        >
                          <LabelBadge label={label} size="sm" />
                        </button>
                      ))}
                      {overflowLabels.length > 0 && (
                        <Popover open={overflowLabelsOpen} onOpenChange={setOverflowLabelsOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                            >
                              <ChevronsUpDown className="size-3.5" />
                              More ({overflowSelectedCount > 0 ? overflowSelectedCount : overflowLabels.length})
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-72 p-2" align="start">
                            <Input
                              value={overflowLabelSearch}
                              onChange={(event) => setOverflowLabelSearch(event.target.value)}
                              placeholder="Search labels..."
                              className="h-8"
                            />
                            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                              {filteredOverflowLabels.length === 0 ? (
                                <div className="px-2 py-3 text-sm text-muted-foreground">
                                  No labels found.
                                </div>
                              ) : (
                                filteredOverflowLabels.map((label) => {
                                  const isSelected = selectedLabelIds.includes(label.id);
                                  return (
                                    <button
                                      key={label.id}
                                      type="button"
                                      onClick={() => toggleLabelFilter(label.id)}
                                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                                    >
                                      <span
                                        className="size-2.5 shrink-0 rounded-full"
                                        style={{ backgroundColor: label.color }}
                                      />
                                      <span className="min-w-0 flex-1 truncate">{label.name}</span>
                                      <span className="text-xs text-muted-foreground">{label.usage_count ?? 0}</span>
                                      {isSelected && <Check className="size-4 text-primary" />}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                      {selectedLabelIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => updateSearchParams({ labels: null })}
                          className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    <div
                      data-testid="ticket-label-filters-measure"
                      aria-hidden
                      className="pointer-events-none absolute -left-[9999px] top-0 opacity-0"
                    >
                      <div className="flex items-center gap-2">
                        <Button
                          ref={labelMeasureMoreRef}
                          variant="outline"
                          size="sm"
                          tabIndex={-1}
                          className="shrink-0"
                        >
                          <ChevronsUpDown className="size-3.5" />
                          More (00)
                        </Button>
                        <span
                          ref={labelMeasureClearRef}
                          className="text-xs underline"
                        >
                          Clear
                        </span>
                        {usageSortedLabels.map((label) => (
                          <span
                            key={`label-measure-${label.id}`}
                            ref={(node) => setLabelMeasureRef(label.id, node)}
                            className="inline-flex"
                          >
                            <LabelBadge label={label} size="sm" />
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                {projectMilestones && projectMilestones.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm text-muted-foreground">Milestones:</span>
                    {projectMilestones.map((milestone) => (
                      <button
                        key={milestone.id}
                        type="button"
                        onClick={() =>
                          updateSearchParams({
                            milestone: selectedMilestoneId === milestone.id ? null : String(milestone.id),
                          })
                        }
                        className={`transition-opacity ${
                          selectedMilestoneId !== null && selectedMilestoneId !== milestone.id
                            ? "opacity-40 hover:opacity-70"
                            : ""
                        }`}
                      >
                        <MilestoneBadge milestone={milestone} size="sm" showProgress />
                      </button>
                    ))}
                    {selectedMilestoneId !== null && (
                      <button
                        type="button"
                        onClick={() => updateSearchParams({ milestone: null })}
                        className="text-xs text-muted-foreground hover:text-foreground underline ml-2"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          />
        )}
      />
    </div>
  );

  if (!projectId) {
    return (
      <main className="flex flex-col items-center justify-center p-8">
        <p className="text-muted-foreground">No project selected</p>
        <Link to="/" className="text-primary hover:underline mt-2">
          Go to projects
        </Link>
      </main>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex flex-1 overflow-hidden">
        {ticketNumberParam ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={defaultLayout}
            onLayoutChanged={handleLayoutChanged}
          >
            <ResizablePanel id="list" defaultSize={50} minSize={25} className="min-h-0">
              <ResizableCardPanel side="list">
                {ticketListContent}
              </ResizableCardPanel>
            </ResizablePanel>

            <ResizableCardHandle />

            <ResizablePanel id="detail" defaultSize={50} minSize={25} className="min-h-0">
              <ResizableCardPanel side="detail">
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
                            autoResize
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

                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <Label htmlFor="new-ticket-triggers">Agent Triggers</Label>
                          <p className="text-xs text-muted-foreground">
                            {newTicketTriggersEnabled
                              ? "Enabled: creation and updates can trigger agents."
                              : "Disabled: no agents will be triggered for this ticket."}
                          </p>
                        </div>
                        <Switch
                          id="new-ticket-triggers"
                          checked={newTicketTriggersEnabled}
                          onCheckedChange={setNewTicketTriggersEnabled}
                        />
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
                      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
                        <div className="flex min-h-0 flex-1 flex-col">
                          <div
                            className="ticket-scroll-viewport relative flex-1 min-h-0"
                            data-testid="ticket-scroll-viewport"
                          >
                            <div
                              ref={ticketScrollRef}
                              onScroll={ticketOnScroll}
                              className="ticket-detail-scroll h-full overflow-y-auto"
                            >
                              <TicketDetail
                                onClose={handleCloseDetail}
                                isEditable
                                onEditModeChange={(mode) => {
                                  if (mode === 'edit') ticketScrollToTop()
                                }}
                              />

                              <div className="mt-6 px-4 pb-4">
                                <h3 className="text-sm font-medium mb-4">
                                  Activity {timeline?.total ? `(${timeline.total})` : ""}
                                </h3>

                                <ActivityTimeline
                                  items={timeline?.items ?? []}
                                  projectId={projectId}
                                  ticketNumber={selectedTicket?.ticket_number}
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
                                  resumableSessionIds={resumableSessionIds}
                                  onResume={handleResumeAgent}
                                  onRerun={handleRerunAgent}
                                  isUpdatingComment={isUpdatingComment}
                                  isDeletingComment={isDeletingComment}
                                />
                              </div>
                            </div>

                            {(!ticketIsAtTop || !ticketIsAtBottom) && (
                              <div
                                data-testid="ticket-scroll-controls"
                                className="ticket-scroll-controls pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 z-10"
                              >
                                {!ticketIsAtTop && (
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    className="ticket-scroll-control-button rounded-full shadow-md h-8 w-8"
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
                                    className="ticket-scroll-control-button rounded-full shadow-md h-8 w-8"
                                    onClick={ticketScrollToBottom}
                                    aria-label="Scroll to bottom"
                                  >
                                    <ArrowDown className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="border-t p-4 shrink-0" data-testid="ticket-composer-shell">
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
                              triggersEnabled={selectedTicket?.triggers_enabled}
                              projectId={projectId}
                            />
                          </div>
                        </div>
                      </Card>
                    )}
                  </>
                )}
              </ResizableCardPanel>
            </ResizablePanel>

            {chatSessionId && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel id="chat" defaultSize={40} minSize={25} className="min-h-0 border-t">
                  <div className="flex flex-col h-full min-h-0">
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
          <div className="w-full h-full min-h-0 pt-3 px-6 pb-6">
            {ticketListContent}
          </div>
        )}
      </div>

    </div>
  );
}

