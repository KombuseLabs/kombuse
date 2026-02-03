import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Button, Textarea } from "@kombuse/ui/base";
import { TicketList, TicketDetail, ChatInput, Markdown } from "@kombuse/ui/components";
import {
  useTickets,
  useTicket,
  useCreateTicket,
  useAppContext,
  useCommentOperations,
  useRealtimeUpdates,
} from "@kombuse/ui/hooks";
import { Plus, ArrowLeft, Pencil, Trash2, Check, X } from "lucide-react";
import type { Ticket } from "@kombuse/types";

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

  const {
    data: tickets,
    isLoading,
    error,
  } = useTickets({ project_id: projectId });

  const {
    data: selectedTicket,
    isLoading: isLoadingTicket,
  } = useTicket(ticketId ? Number(ticketId) : 0);

  const createTicket = useCreateTicket();

  // Comment operations from context-aware hook
  const {
    comments,
    createComment,
    updateComment,
    deleteComment,
    isCreating: isCreatingComment,
    isUpdating: isUpdatingComment,
    isDeleting: isDeletingComment,
  } = useCommentOperations();

  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editBody, setEditBody] = useState("");

  // Sync project ID to context
  useEffect(() => {
    setCurrentProjectId(projectId ?? null);
    setView("tickets");
  }, [projectId, setCurrentProjectId, setView]);

  // Sync selected ticket to context
  useEffect(() => {
    setCurrentTicket(selectedTicket ?? null);
  }, [selectedTicket, setCurrentTicket]);

  const handleAddComment = async (body: string) => {
    await createComment(body, "user-1"); // TODO: Get from auth context
  };

  const handleCreateTicket = () => {
    if (!projectId) return;
    const date = new Date().toISOString().split("T")[0];
    createTicket.mutate({
      title: `New ticket ${date}`,
      project_id: projectId,
      author_id: "user-1", // TODO: Get from auth context
    });
  };

  const handleTicketClick = (ticket: Ticket) => {
    navigate(`/projects/${projectId}/tickets/${ticket.id}`);
  };

  const handleCloseDetail = () => {
    navigate(`/projects/${projectId}/tickets`);
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
    <main className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Link
            to="/projects"
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-bold">Tickets</h1>
          <span className="text-sm text-muted-foreground">
            Project: {projectId}
          </span>
        </div>
        <Button onClick={handleCreateTicket} disabled={createTicket.isPending}>
          <Plus className="size-4" />
          {createTicket.isPending ? "Creating..." : "Create Ticket"}
        </Button>
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
              onTicketClick={handleTicketClick}
            />
          )}
        </div>

        {/* Ticket Detail */}
        {ticketId && (
          <div className="w-1/2 flex flex-col">
            {isLoadingTicket && (
              <div className="text-center py-8 text-muted-foreground">
                Loading ticket...
              </div>
            )}

            {selectedTicket && (
              <>
                {/* Scrollable area: ticket detail + comments */}
                <div className="flex-1 overflow-y-auto p-6">
                  <TicketDetail
                    onClose={handleCloseDetail}
                    isEditable
                  />

                  {/* Comments List */}
                  <div className="mt-6">
                    <h3 className="text-sm font-medium mb-4">
                      Comments {comments.length > 0 && `(${comments.length})`}
                    </h3>

                    {comments.length > 0 ? (
                      <div className="space-y-3">
                        {comments.map((comment) => (
                          <div
                            key={comment.id}
                            className="p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">
                                  {comment.author_id}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(comment.created_at).toLocaleString()}
                                </span>
                                {comment.is_edited && (
                                  <span className="text-xs text-muted-foreground">
                                    (edited)
                                  </span>
                                )}
                              </div>
                              {editingCommentId === comment.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-muted-foreground hover:text-primary"
                                    onClick={async () => {
                                      await updateComment(comment.id, editBody);
                                      setEditingCommentId(null);
                                      setEditBody("");
                                    }}
                                    disabled={isUpdatingComment || !editBody.trim()}
                                  >
                                    <Check className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => {
                                      setEditingCommentId(null);
                                      setEditBody("");
                                    }}
                                  >
                                    <X className="size-3" />
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => {
                                      setEditingCommentId(comment.id);
                                      setEditBody(comment.body);
                                    }}
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => deleteComment(comment.id)}
                                    disabled={isDeletingComment}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            {editingCommentId === comment.id ? (
                              <Textarea
                                value={editBody}
                                onChange={(e) => setEditBody(e.target.value)}
                                className="min-h-15 text-sm"
                                autoFocus
                              />
                            ) : (
                              <div className="text-sm">
                                <Markdown>{comment.body}</Markdown>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No comments yet</p>
                    )}
                  </div>
                </div>

                {/* Fixed ChatInput at bottom */}
                <div className="border-t p-4">
                  <ChatInput
                    onSubmit={handleAddComment}
                    isLoading={isCreatingComment}
                    placeholder="Add a comment..."
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
