import { Button } from "@kombuse/ui/base";
import { TicketList } from "@kombuse/ui/components";
import { useTickets, useCreateTicket } from "@kombuse/ui/hooks";
import { Plus } from "lucide-react";

export function Tickets() {
  const { data: tickets, isLoading, error } = useTickets();
  const createTicket = useCreateTicket();

  const handleCreateTicket = () => {
    const date = new Date().toISOString().split("T")[0];
    createTicket.mutate({
      title: `hello ${date}`,
      project_id: "1",
    });
  };

  return (
    <main className="flex flex-col p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-4xl font-bold">Tickets</h1>
        <Button onClick={handleCreateTicket} disabled={createTicket.isPending}>
          <Plus className="size-4" />
          {createTicket.isPending ? "Creating..." : "Create Ticket"}
        </Button>
      </div>

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

      {!isLoading && !error && tickets && <TicketList tickets={tickets} />}
    </main>
  );
}
