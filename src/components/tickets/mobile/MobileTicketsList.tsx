import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  TicketIcon,
  UserCheck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Segmented,
  MobileListItem,
  EmptyState,
  ErrorState,
  PullToRefresh,
  MobileFab,
  MobileListSkeleton,
  type ChipOption,
} from "@/components/mobile";
import { TicketStatusBadge } from "@/components/tickets/TicketStatusBadge";
import { TicketPriorityBadge } from "@/components/tickets/TicketPriorityBadge";
import { TicketDetailSheet } from "@/components/tickets/TicketDetailSheet";
import {
  useUpdateTicketStatus,
  useAssignTicket,
  type TicketWithRelations,
  type TicketStatus,
} from "@/hooks/useTickets";
import {
  useTicketsSearch,
  useTicketQueueCounts,
  type QueueTab,
} from "@/hooks/useTicketsSearch";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { useBrandOperators } from "@/hooks/useBrandOperators";

const QUEUE_OPTIONS: ChipOption<QueueTab>[] = [
  { value: "all", label: "Tutti" },
  { value: "my_queue", label: "Miei" },
  { value: "unassigned", label: "Non assegnati" },
  { value: "sla_breached", label: "SLA scaduto" },
];

function contactName(t: TicketWithRelations): string {
  const c = t.contacts;
  const n = [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
  return n || c?.email || "Senza contatto";
}

export function MobileTicketsList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasBrandSelected } = useBrand();
  const { supabaseUser, hasRole } = useAuth();
  const { data: operators = [] } = useBrandOperators();

  const isOperator =
    hasRole("admin") ||
    hasRole("operatore_callcenter") ||
    hasRole("responsabile_callcenter");

  const currentOperator = operators.find(
    (op) => op.supabase_auth_id === supabaseUser?.id,
  );

  const [queueTab, setQueueTab] = useState<QueueTab>(
    isOperator ? "my_queue" : "all",
  );
  const [selectedTicket, setSelectedTicket] =
    useState<TicketWithRelations | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isError, refetch, error } = useTicketsSearch({
    queueTab,
    limit: 100,
  });
  const { data: queueCounts } = useTicketQueueCounts({ queueTab });

  const updateStatus = useUpdateTicketStatus();
  const assignTicket = useAssignTicket();

  const tickets = data?.tickets ?? [];

  const optionsWithCount = useMemo<ChipOption<QueueTab>[]>(
    () =>
      QUEUE_OPTIONS.filter(
        (o) => o.value !== "my_queue" || isOperator,
      ).map((o) => ({
        ...o,
        count:
          o.value === "all"
            ? queueCounts?.all
            : o.value === "my_queue"
              ? queueCounts?.my_queue
              : o.value === "unassigned"
                ? queueCounts?.unassigned
                : queueCounts?.sla_breached,
      })),
    [queueCounts, isOperator],
  );

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tickets"] }),
      queryClient.invalidateQueries({ queryKey: ["ticket-queue-counts"] }),
    ]);
  };

  const handleTake = async (t: TicketWithRelations) => {
    if (!currentOperator) {
      toast.error("Non sei autorizzato ad assegnare ticket");
      return;
    }
    try {
      await assignTicket.mutateAsync({
        ticketId: t.id,
        userId: currentOperator.user_id,
      });
      toast.success("Ticket preso in carico");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("STALE_TICKET")) {
        toast.error("Ticket aggiornato altrove. Ricarica e riprova.");
      } else {
        toast.error("Errore nell'assegnazione");
      }
    }
  };

  const handleResolve = async (t: TicketWithRelations) => {
    try {
      await updateStatus.mutateAsync({
        ticketId: t.id,
        status: "resolved" as TicketStatus,
      });
      toast.success("Ticket risolto");
    } catch {
      toast.error("Impossibile risolvere il ticket");
    }
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <EmptyState
          icon={AlertCircle}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla sidebar per visualizzare i ticket."
        />
      </div>
    );
  }

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-3 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold tracking-tight">Ticket</h1>
              <p className="truncate text-xs text-muted-foreground">
                {data?.totalCount != null ? (
                  <>
                    <span className="tabular-nums">{data.totalCount}</span>{" "}
                    {data.totalCount === 1 ? "ticket" : "ticket"}
                  </>
                ) : (
                  "Caricamento…"
                )}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <Segmented<QueueTab>
              options={optionsWithCount}
              value={queueTab}
              onChange={setQueueTab}
              ariaLabel="Coda ticket"
              asTabs
            />
          </div>
        </header>

        {/* States */}
        {isError ? (
          <div className="px-4">
            <ErrorState
              title="Errore caricamento ticket"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => {
                void refetch();
              }}
            />
          </div>
        ) : isLoading ? (
          <div className="px-4">
            <MobileListSkeleton count={6} />
          </div>
        ) : tickets.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={TicketIcon}
              title="Nessun ticket"
              description={
                queueTab === "my_queue"
                  ? "Non hai ticket assegnati."
                  : queueTab === "unassigned"
                    ? "Tutti i ticket sono assegnati."
                    : queueTab === "sla_breached"
                      ? "Nessun ticket con SLA scaduto."
                      : "Non ci sono ticket in questa coda."
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-3" aria-label="Lista ticket">
            {tickets.map((t) => {
              const isClosed = t.status === "closed" || t.status === "resolved";
              const assigneeLabel =
                t.users?.full_name ||
                t.users?.email ||
                "Non assegnato";
              const opened = formatDistanceToNow(new Date(t.opened_at), {
                addSuffix: true,
                locale: it,
              });
              return (
                <li key={t.id}>
                  <MobileListItem
                    leading={
                      <div
                        aria-hidden
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"
                      >
                        <TicketIcon className="h-4 w-4 text-muted-foreground" />
                      </div>
                    }
                    title={
                      <span className="flex items-center gap-2">
                        <span className="truncate">{t.title}</span>
                      </span>
                    }
                    subtitle={
                      <span className="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
                        <span className="truncate">{contactName(t)}</span>
                        <span aria-hidden>·</span>
                        <span className="truncate">{assigneeLabel}</span>
                        <span aria-hidden>·</span>
                        <span className="shrink-0 tabular-nums">{opened}</span>
                      </span>
                    }
                    trailing={
                      <div className="flex flex-col items-end gap-1">
                        <TicketStatusBadge status={t.status} />
                        <TicketPriorityBadge priority={t.priority} />
                      </div>
                    }
                    onSelect={() => {
                      setSelectedTicket(t);
                      setSheetOpen(true);
                    }}
                    ariaLabel={`Apri ticket ${t.title}`}
                    actions={
                      isClosed
                        ? []
                        : [
                            ...(currentOperator &&
                            t.assigned_to_user_id !== currentOperator.user_id
                              ? [
                                  {
                                    id: "take",
                                    label: "Prendi",
                                    icon: <UserCheck className="h-4 w-4" />,
                                    variant: "primary" as const,
                                    onSelect: () => void handleTake(t),
                                  },
                                ]
                              : []),
                            {
                              id: "resolve",
                              label: "Risolvi",
                              icon: <CheckCircle2 className="h-4 w-4" />,
                              variant: "primary" as const,
                              confirm: {
                                title: "Risolvere il ticket?",
                                description: t.title,
                                confirmLabel: "Risolvi",
                                cancelLabel: "Annulla",
                              },
                              onSelect: () => void handleResolve(t),
                            },
                          ]
                    }
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <TicketDetailSheet
        ticket={selectedTicket}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      {/* FAB: nuovo ticket — parte dal contatto */}
      <MobileFab
        icon={<Plus className="h-6 w-6" />}
        label="Nuovo ticket (scegli contatto)"
        onClick={() => navigate("/contacts")}
      />
    </PullToRefresh>
  );
}

export default MobileTicketsList;
