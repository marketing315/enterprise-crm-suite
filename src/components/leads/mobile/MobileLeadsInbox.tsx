import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Inbox,
  Phone,
  UserPlus,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Segmented,
  MobileListItem,
  EmptyState,
  ErrorState,
  PullToRefresh,
  MobileListSkeleton,
  type ChipOption,
} from "@/components/mobile";
import { ContactDetailSheet } from "@/components/contacts/ContactDetailSheet";
import { TagBadge } from "@/components/tags/TagBadge";
import { Badge } from "@/components/ui/badge";
import {
  useLeadEvents,
  type PeriodFilter,
  type LeadEventResult,
} from "@/hooks/useLeadEvents";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const PERIOD_OPTIONS: ChipOption<PeriodFilter>[] = [
  { value: "today", label: "Oggi" },
  { value: "7days", label: "7g" },
  { value: "30days", label: "30g" },
  { value: "all", label: "Tutti" },
];

function contactName(e: LeadEventResult): string {
  const c = e.contact;
  if (!c?.id) return "Senza contatto";
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.email || "Senza nome";
}

function sourceLabel(e: LeadEventResult): string {
  if (e.source_name) return e.source_name;
  if (e.source === "webhook") return "Webhook";
  if (e.source === "manual") return "Manuale";
  if (e.source === "import") return "Import";
  return e.source;
}

function priorityIntent(
  p: number | null,
): "destructive" | "default" | "secondary" | null {
  if (p == null) return null;
  if (p >= 8) return "destructive";
  if (p >= 5) return "default";
  return "secondary";
}

export function MobileLeadsInbox() {
  const queryClient = useQueryClient();
  const { hasBrandSelected } = useBrand();
  const { isAdmin, isCeo } = useAuth();
  const canSeeArchived = isAdmin || isCeo;

  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("7days");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(
    null,
  );
  const [sheetOpen, setSheetOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useLeadEvents({
    periodFilter,
    sourceFilter,
    showArchived,
  });

  const events = useMemo(() => data?.events ?? [], [data?.events]);
  const total = data?.total ?? 0;

  const sources = useMemo<ChipOption<string>[]>(() => {
    const set = new Map<string, string>();
    set.set("all", "Tutte");
    for (const e of events) {
      const key = e.source_name || e.source;
      if (!set.has(key)) set.set(key, key);
    }
    return [...set.entries()].map(([value, label]) => ({ value, label }));
  }, [events]);

  // Realtime: invalidate lead-events query on insert/update
  useEffect(() => {
    if (!hasBrandSelected) return;
    const ch = supabase
      .channel("mobile-leads-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lead_events" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["lead-events-rpc"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [hasBrandSelected, queryClient]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lead-events-rpc"] });
  };

  const handleArchive = async (e: LeadEventResult, archived: boolean) => {
    const { error: err } = await supabase.rpc("set_lead_event_archived", {
      p_event_id: e.id,
      p_archived: archived,
    });
    if (err) {
      toast.error(archived ? "Impossibile scartare" : "Impossibile ripristinare");
      return;
    }
    toast.success(archived ? "Lead scartato" : "Lead ripristinato");
    await queryClient.invalidateQueries({ queryKey: ["lead-events-rpc"] });
  };

  const handleOpenContact = (contactId: string | null) => {
    if (!contactId) {
      toast.info("Nessun contatto associato a questo lead");
      return;
    }
    setSelectedContactId(contactId);
    setSheetOpen(true);
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <EmptyState
          icon={AlertCircle}
          title="Nessun brand selezionato"
          description="Seleziona un brand dalla sidebar per vedere i lead in arrivo."
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
              <h1 className="text-lg font-semibold tracking-tight">
                Lead in arrivo
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {isLoading ? (
                  "Caricamento…"
                ) : (
                  <>
                    <span className="tabular-nums">{total}</span>{" "}
                    {total === 1 ? "lead" : "lead"}
                  </>
                )}
              </p>
            </div>
            {canSeeArchived && (
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="press-scale rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground"
                aria-pressed={showArchived}
              >
                {showArchived ? "Mostra attivi" : "Mostra archiviati"}
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <Segmented<PeriodFilter>
              options={PERIOD_OPTIONS}
              value={periodFilter}
              onChange={setPeriodFilter}
              ariaLabel="Periodo"
              asTabs
              size="sm"
            />
            {sources.length > 1 && (
              <Segmented<string>
                options={sources}
                value={sourceFilter}
                onChange={setSourceFilter}
                ariaLabel="Fonte"
                size="sm"
              />
            )}
          </div>
        </header>

        {/* States */}
        {isError ? (
          <div className="px-4">
            <ErrorState
              title="Errore caricamento lead"
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
        ) : events.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={Inbox}
              title="Nessun lead in arrivo"
              description={
                showArchived
                  ? "Nessun lead archiviato nel periodo selezionato."
                  : "Quando arriveranno nuovi lead li vedrai qui."
              }
            />
          </div>
        ) : (
          <ul className="flex flex-col gap-2 px-3" aria-label="Lista lead">
            {events.map((e) => {
              const name = contactName(e);
              const phone = e.contact?.primary_phone ?? null;
              const received = new Date(e.received_at);
              const relative = formatDistanceToNow(received, {
                addSuffix: true,
                locale: it,
              });
              const absolute = format(received, "dd MMM HH:mm", { locale: it });
              const prio = priorityIntent(e.ai_priority);
              return (
                <li key={e.id}>
                  <MobileListItem
                    leading={
                      <div
                        aria-hidden
                        className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted"
                      >
                        <Inbox className="h-4 w-4 text-muted-foreground" />
                      </div>
                    }
                    title={
                      <span className="flex items-center gap-2">
                        <span className="truncate">{name}</span>
                        {e.archived && (
                          <Badge variant="outline" className="text-[10px]">
                            Archiviato
                          </Badge>
                        )}
                      </span>
                    }
                    subtitle={
                      <span className="flex min-w-0 flex-col gap-0.5 text-xs text-muted-foreground">
                        <span className="flex min-w-0 items-center gap-1.5 truncate">
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {sourceLabel(e)}
                          </Badge>
                          {prio && (
                            <Badge variant={prio} className="shrink-0 text-[10px]">
                              P{e.ai_priority}
                            </Badge>
                          )}
                          {phone && (
                            <span className="truncate font-mono">{phone}</span>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="tabular-nums">{relative}</span>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">{absolute}</span>
                        </span>
                        {e.tags.length > 0 && (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {e.tags.slice(0, 3).map((t) => (
                              <TagBadge
                                key={t.id}
                                name={t.name}
                                color={t.color}
                                size="sm"
                              />
                            ))}
                            {e.tags.length > 3 && (
                              <Badge variant="outline" className="text-[10px]">
                                +{e.tags.length - 3}
                              </Badge>
                            )}
                          </span>
                        )}
                      </span>
                    }
                    className={e.archived ? "opacity-60" : undefined}
                    onSelect={() => handleOpenContact(e.contact_id)}
                    ariaLabel={`Apri lead di ${name}`}
                    actions={
                      e.archived
                        ? [
                            {
                              id: "restore",
                              label: "Ripristina",
                              icon: <ArchiveRestore className="h-4 w-4" />,
                              variant: "primary" as const,
                              onSelect: () => void handleArchive(e, false),
                            },
                          ]
                        : [
                            ...(e.contact_id
                              ? [
                                  {
                                    id: "assign",
                                    label: "Assegna",
                                    icon: <UserPlus className="h-4 w-4" />,
                                    variant: "primary" as const,
                                    onSelect: () =>
                                      handleOpenContact(e.contact_id),
                                  },
                                ]
                              : []),
                            ...(phone
                              ? [
                                  {
                                    id: "call",
                                    label: "Chiama",
                                    icon: <Phone className="h-4 w-4" />,
                                    variant: "primary" as const,
                                    onSelect: () => {
                                      window.location.href = `tel:${phone}`;
                                    },
                                  },
                                ]
                              : []),
                            {
                              id: "discard",
                              label: "Scarta",
                              icon: <Archive className="h-4 w-4" />,
                              variant: "danger" as const,
                              confirm: {
                                title: "Scartare questo lead?",
                                description: `${name} — ${sourceLabel(e)}`,
                                confirmLabel: "Scarta",
                                cancelLabel: "Annulla",
                              },
                              onSelect: () => void handleArchive(e, true),
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

      <ContactDetailSheet
        contactId={selectedContactId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </PullToRefresh>
  );
}

export default MobileLeadsInbox;
