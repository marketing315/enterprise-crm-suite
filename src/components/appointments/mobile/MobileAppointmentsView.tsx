import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  parseISO,
  isSameDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  CheckCircle2,
  MapPin,
  Phone,
  Plus,
  UserRound,
  XCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";
import { useBrand } from "@/contexts/BrandContext";
import {
  useAppointments,
  useSetAppointmentStatus,
} from "@/hooks/useAppointments";
import type {
  AppointmentStatus,
  AppointmentWithRelations,
} from "@/types/database";

type RangeKey = "today" | "week" | "month";

const RANGE_OPTIONS: ChipOption<RangeKey>[] = [
  { value: "today", label: "Oggi" },
  { value: "week", label: "Settimana" },
  { value: "month", label: "Mese" },
];

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Programmato",
  confirmed: "Confermato",
  cancelled: "Annullato",
  rescheduled: "Riprogrammato",
  visited: "Visitato",
  no_show: "Non presentato",
};

const STATUS_DOT: Record<AppointmentStatus, string> = {
  scheduled: "bg-warning",
  confirmed: "bg-success",
  cancelled: "bg-destructive",
  rescheduled: "bg-primary/70",
  visited: "bg-primary",
  no_show: "bg-destructive",
};

function getRange(key: RangeKey): { from: Date; to: Date } {
  const now = new Date();
  switch (key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "week":
      return {
        from: startOfWeek(now, { weekStartsOn: 1 }),
        to: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "month":
      return { from: startOfMonth(now), to: endOfMonth(now) };
  }
}

function contactName(apt: AppointmentWithRelations): string {
  const c = apt.contact;
  const n = [c?.first_name, c?.last_name].filter(Boolean).join(" ").trim();
  return n || "Senza nome";
}

function contactInitials(apt: AppointmentWithRelations): string {
  const c = apt.contact;
  const a = (c?.first_name || "").trim()[0];
  const b = (c?.last_name || "").trim()[0];
  return ((a ?? "") + (b ?? "")).toUpperCase() || "?";
}

function dayHeader(d: Date): string {
  const today = new Date();
  if (isSameDay(d, today)) {
    return `Oggi · ${format(d, "EEEE d MMMM", { locale: it })}`;
  }
  return format(d, "EEEE d MMMM", { locale: it });
}

export function MobileAppointmentsView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentBrand, hasBrandSelected, isAllBrandsSelected } = useBrand();

  const [range, setRange] = useState<RangeKey>("today");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { from, to } = useMemo(() => getRange(range), [range]);

  const { data, isLoading, isError, refetch, error } = useAppointments({
    dateFrom: from.toISOString(),
    dateTo: to.toISOString(),
  });

  const setStatus = useSetAppointmentStatus();

  const appointments = data?.appointments ?? [];

  // Sort + group by day
  const grouped = useMemo(() => {
    const sorted = [...appointments].sort(
      (a, b) =>
        new Date(a.scheduled_at).getTime() -
        new Date(b.scheduled_at).getTime(),
    );
    const map = new Map<string, AppointmentWithRelations[]>();
    sorted.forEach((apt) => {
      const dayKey = format(parseISO(apt.scheduled_at), "yyyy-MM-dd");
      const arr = map.get(dayKey) ?? [];
      arr.push(apt);
      map.set(dayKey, arr);
    });
    return Array.from(map.entries()).map(([key, items]) => ({
      key,
      date: parseISO(`${key}T00:00:00`),
      items,
    }));
  }, [appointments]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["appointments"] });
  };

  const handleSetStatus = async (
    apt: AppointmentWithRelations,
    status: AppointmentStatus,
  ) => {
    try {
      await setStatus.mutateAsync({ appointmentId: apt.id, status });
      toast.success(
        status === "visited"
          ? "Appuntamento segnato come visitato"
          : status === "no_show"
            ? "Appuntamento segnato come no-show"
            : "Stato aggiornato",
      );
    } catch (e) {
      toast.error(
        e instanceof Error
          ? `Impossibile aggiornare: ${e.message}`
          : "Impossibile aggiornare lo stato",
      );
    }
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-4">
        <Alert>
          <Calendar className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare gli appuntamenti.
          </AlertDescription>
        </Alert>
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
                Appuntamenti
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {isAllBrandsSelected
                  ? "Tutti i brand"
                  : currentBrand?.name}
                {" · "}
                <span className="tabular-nums">{appointments.length}</span>{" "}
                {appointments.length === 1 ? "appuntamento" : "appuntamenti"}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <Segmented<RangeKey>
              options={RANGE_OPTIONS}
              value={range}
              onChange={setRange}
              ariaLabel="Intervallo appuntamenti"
              asTabs
            />
          </div>
        </header>

        {/* States */}
        {isError ? (
          <div className="px-4">
            <ErrorState
              title="Errore caricamento appuntamenti"
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
        ) : appointments.length === 0 ? (
          <div className="px-4">
            <EmptyState
              icon={Calendar}
              title="Nessun appuntamento"
              description={
                range === "today"
                  ? "Non hai appuntamenti per oggi."
                  : range === "week"
                    ? "Nessun appuntamento questa settimana."
                    : "Nessun appuntamento questo mese."
              }
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map((group) => (
              <section
                key={group.key}
                aria-label={dayHeader(group.date)}
                className="flex flex-col gap-2"
              >
                <h2 className="px-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {dayHeader(group.date)}
                </h2>
                <ul className="flex flex-col gap-2 px-3">
                  {group.items.map((apt) => {
                    const time = format(parseISO(apt.scheduled_at), "HH:mm");
                    const isFinal =
                      apt.status === "visited" ||
                      apt.status === "cancelled" ||
                      apt.status === "no_show";

                    return (
                      <li key={apt.id}>
                        <MobileListItem
                          leading={
                            <div className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-muted text-center">
                              <span className="text-sm font-semibold tabular-nums">
                                {time}
                              </span>
                            </div>
                          }
                          title={
                            <span className="flex items-center gap-2">
                              <span className="truncate">
                                {contactName(apt)}
                              </span>
                              <span
                                aria-hidden
                                className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[apt.status]}`}
                                title={STATUS_LABEL[apt.status]}
                              />
                            </span>
                          }
                          subtitle={
                            <span className="flex min-w-0 items-center gap-2 truncate text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1 truncate">
                                <UserRound className="h-3 w-3 shrink-0" />
                                <span className="truncate">
                                  {apt.sales_user?.full_name ||
                                    apt.sales_user?.email ||
                                    "Non assegnato"}
                                </span>
                              </span>
                              {apt.city && (
                                <span className="inline-flex items-center gap-1 truncate">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{apt.city}</span>
                                </span>
                              )}
                            </span>
                          }
                          trailing={
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {contactInitials(apt)}
                            </span>
                          }
                          onSelect={() => navigate(`/appointments/${apt.id}`)}
                          ariaLabel={`Apri appuntamento ${contactName(apt)} alle ${time}`}
                          actions={
                            isFinal
                              ? apt.contact?.primary_phone
                                ? [
                                    {
                                      id: "call",
                                      label: "Chiama",
                                      icon: <Phone className="h-4 w-4" />,
                                      variant: "primary",
                                      onSelect: () => {
                                        window.location.href = `tel:${apt.contact!.primary_phone}`;
                                      },
                                    },
                                  ]
                                : []
                              : [
                                  {
                                    id: "visited",
                                    label: "Visitato",
                                    icon: <CheckCircle2 className="h-4 w-4" />,
                                    variant: "primary",
                                    onSelect: () =>
                                      void handleSetStatus(apt, "visited"),
                                  },
                                  {
                                    id: "no-show",
                                    label: "No show",
                                    icon: <XCircle className="h-4 w-4" />,
                                    variant: "destructive",
                                    confirm: {
                                      title: "Segnare come no-show?",
                                      description: `${contactName(apt)} alle ${time}`,
                                      confirmLabel: "Conferma",
                                      cancelLabel: "Annulla",
                                    },
                                    onSelect: () =>
                                      void handleSetStatus(apt, "no_show"),
                                  },
                                ]
                          }
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />

      <MobileFab
        icon={<Plus className="h-6 w-6" />}
        label="Nuovo appuntamento"
        onClick={() => setDialogOpen(true)}
      />
    </PullToRefresh>
  );
}

export default MobileAppointmentsView;
