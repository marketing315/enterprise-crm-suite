/**
 * F6.1 — Mobile Notifications (/notifications)
 * Lista raggruppata per data, tap → contesto entità, "segna tutte come lette" nel header.
 * Riusa gli stessi hook desktop (usePaginatedNotifications etc.) — zero RPC nuove.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  isToday,
  isYesterday,
  isThisWeek,
  format,
  formatDistanceToNow,
} from "date-fns";
import { it } from "date-fns/locale";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, ChevronRight, Trash2 } from "lucide-react";

import {
  EmptyState,
  ErrorState,
  MobileListSkeleton,
  PullToRefresh,
  Segmented,
  type ChipOption,
} from "@/components/mobile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useBrand } from "@/contexts/BrandContext";
import {
  usePaginatedNotifications,
  useMarkAllNotificationsRead,
  useDeleteReadNotifications,
  useMarkNotificationsRead,
  type Notification,
} from "@/hooks/useNotifications";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Filter = "all" | "unread";

const FILTER_OPTIONS: ChipOption<Filter>[] = [
  { value: "all", label: "Tutte" },
  { value: "unread", label: "Non lette" },
];

const TYPE_LABELS: Record<string, string> = {
  lead_event_created: "Lead",
  pipeline_stage_changed: "Pipeline",
  tags_updated: "Tag",
  appointment_created: "Appuntamento",
  appointment_updated: "Appuntamento",
  ticket_created: "Ticket",
  ticket_assigned: "Ticket",
  ticket_status_changed: "Ticket",
  chat_message: "Chat",
};

const TYPE_DOT: Record<string, string> = {
  lead_event_created: "bg-blue-500",
  pipeline_stage_changed: "bg-purple-500",
  tags_updated: "bg-green-500",
  appointment_created: "bg-orange-500",
  appointment_updated: "bg-orange-400",
  ticket_created: "bg-red-500",
  ticket_assigned: "bg-yellow-500",
  ticket_status_changed: "bg-gray-500",
  chat_message: "bg-primary",
};

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  ticket: (id) => `/tickets?open=${id}`,
  contact: (id) => `/contacts?open=${id}`,
  deal: (id) => `/pipeline?deal=${id}`,
  appointment: (id) => `/appointments?open=${id}`,
  lead_event: (id) => `/events?event=${id}`,
  chat_thread: (id) => `/chat?thread=${id}`,
};

function groupKey(d: Date): string {
  if (isToday(d)) return "Oggi";
  if (isYesterday(d)) return "Ieri";
  if (isThisWeek(d, { weekStartsOn: 1 })) return "Questa settimana";
  return format(d, "MMMM yyyy", { locale: it });
}

function MobileNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const brandId = isAllBrandsSelected ? undefined : currentBrand?.id;

  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [accumulated, setAccumulated] = useState<Notification[]>([]);
  const limit = 30;

  const { data, isLoading, isError, error, isFetching, refetch } =
    usePaginatedNotifications({
      brandId,
      typeFilter: null,
      unreadOnly: filter === "unread",
      limit,
      offset,
    });

  useEffect(() => {
    if (!data?.data) return;
    if (offset === 0) {
      setAccumulated(data.data);
    } else {
      setAccumulated((prev) => {
        const ids = new Set(prev.map((n) => n.id));
        return [...prev, ...data.data.filter((n) => !ids.has(n.id))];
      });
    }
  }, [data, offset]);

  useEffect(() => {
    setOffset(0);
    setAccumulated([]);
  }, [filter, brandId]);

  const markAllRead = useMarkAllNotificationsRead();
  const deleteRead = useDeleteReadNotifications();
  const markRead = useMarkNotificationsRead();

  const total = data?.total ?? 0;
  const hasMore = offset + limit < total;
  const unreadCount = accumulated.filter((n) => !n.read_at).length;

  const grouped = useMemo(() => {
    const map = new Map<string, Notification[]>();
    for (const n of accumulated) {
      const k = groupKey(new Date(n.created_at));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(n);
    }
    return Array.from(map.entries());
  }, [accumulated]);

  const handleRefresh = async () => {
    setOffset(0);
    setAccumulated([]);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    await refetch();
  };

  const onClickNotification = (n: Notification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.entity_type && n.entity_id) {
      const builder = ENTITY_ROUTES[n.entity_type];
      if (builder) navigate(builder(n.entity_id));
    }
  };

  const onMarkAll = () =>
    markAllRead.mutate(brandId, {
      onSuccess: (count) => {
        toast.success(`${count} notifiche segnate come lette`);
        void refetch();
      },
    });

  const onDeleteRead = () =>
    deleteRead.mutate(brandId, {
      onSuccess: (count) => {
        toast.success(`${count} notifiche eliminate`);
        void refetch();
      },
    });

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="flex flex-col gap-4 pb-24">
        {/* Header */}
        <header className="sticky top-0 z-20 -mt-3 border-b border-border/40 bg-background/85 px-4 pb-3 pt-3 backdrop-blur">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <Bell className="h-5 w-5" /> Notifiche
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {total} totali · {unreadCount} non lette
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                aria-label="Segna tutte come lette"
                onClick={onMarkAll}
                disabled={markAllRead.isPending || unreadCount === 0}
              >
                <CheckCheck className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Elimina notifiche lette"
                onClick={onDeleteRead}
                disabled={deleteRead.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-3">
            <Segmented<Filter>
              options={FILTER_OPTIONS}
              value={filter}
              onChange={setFilter}
              ariaLabel="Filtro notifiche"
              asTabs
              size="sm"
            />
          </div>
        </header>

        {/* List */}
        <section className="px-4" aria-label="Notifiche">
          {isError ? (
            <ErrorState
              title="Errore caricamento notifiche"
              description={error instanceof Error ? error.message : undefined}
              onRetry={() => void refetch()}
            />
          ) : isLoading && accumulated.length === 0 ? (
            <MobileListSkeleton count={6} />
          ) : accumulated.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nessuna notifica"
              description={
                filter === "unread"
                  ? "Sei in pari! Nessuna notifica non letta."
                  : "Le nuove notifiche compariranno qui."
              }
            />
          ) : (
            <div className="space-y-5">
              {grouped.map(([label, items]) => (
                <div key={label} className="space-y-2">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {label}
                  </h2>
                  <ul className="flex flex-col gap-2" aria-label={label}>
                    {items.map((n) => {
                      const isUnread = !n.read_at;
                      const typeLabel = TYPE_LABELS[n.type] ?? n.type;
                      const dot = TYPE_DOT[n.type] ?? "bg-gray-400";
                      const hasLink = !!(n.entity_type && n.entity_id);
                      return (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => onClickNotification(n)}
                            className={cn(
                              "press-scale flex w-full items-start gap-3 rounded-2xl border border-border/60 bg-card p-3 text-left shadow-card",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              isUnread && "bg-muted/40",
                            )}
                          >
                            <div
                              className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dot)}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center gap-2">
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-2 text-[10px] font-normal"
                                >
                                  {typeLabel}
                                </Badge>
                                {isUnread && (
                                  <span
                                    className="h-2 w-2 rounded-full bg-primary"
                                    aria-label="Non letta"
                                  />
                                )}
                                <span className="ml-auto text-[11px] text-muted-foreground">
                                  {formatDistanceToNow(new Date(n.created_at), {
                                    addSuffix: true,
                                    locale: it,
                                  })}
                                </span>
                              </div>
                              <p className="text-sm font-medium">{n.title}</p>
                              {n.body && (
                                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                                  {n.body}
                                </p>
                              )}
                            </div>
                            {hasLink && (
                              <ChevronRight
                                className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}

              {hasMore && (
                <div className="flex justify-center py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOffset((p) => p + limit)}
                    disabled={isFetching}
                  >
                    {isFetching
                      ? "Caricamento…"
                      : `Carica altre (${Math.max(0, total - accumulated.length)})`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </PullToRefresh>
  );
}

export default MobileNotifications;
export { MobileNotifications };
