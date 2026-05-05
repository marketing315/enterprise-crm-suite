import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
  parseISO,
  isSameDay,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { it } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight, Plus, RefreshCw, AlertTriangle, List, Users, X, Download, Send } from "lucide-react";
import { dispatchRouteNow } from "@/hooks/useSalesRoute";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointments, useUpdateAppointment } from "@/hooks/useAppointments";
import { useAppointmentConflict } from "@/features/appointments/useAppointmentConflict";
import { BulkReassignDialog } from "@/features/appointments/BulkReassignDialog";
import { exportAppointmentsCsv } from "@/features/appointments/exportAppointmentsCsv";
import { SavedFiltersBar } from "@/features/appointments/SavedFiltersBar";
import { applyAppointmentFilter, type AppointmentFilter } from "@/features/appointments/savedFilters";
import { useAuth } from "@/contexts/AuthContext";
import type { AppointmentWithRelations } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const HOURS_START = 8; // 08:00
const HOURS_END = 21; // 21:00 (esclusivo)
const SLOT_MINUTES = 30;
const SLOT_PX = 32; // altezza riga slot

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-amber-500/90 border-amber-600",
  confirmed: "bg-emerald-500/90 border-emerald-600",
  visited: "bg-primary/90 border-primary",
  completed: "bg-primary/90 border-primary",
  cancelled: "bg-destructive/80 border-destructive",
  no_show: "bg-destructive/80 border-destructive",
  rescheduled: "bg-blue-500/90 border-blue-600",
  draft: "bg-muted border-border",
};

interface DraggedAppointment {
  id: string;
  durationMinutes: number;
  assignedSalesUserId: string | null;
  scheduledAt: string;
}

export default function AppointmentsCalendar() {
  const navigate = useNavigate();
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showBulkReassign, setShowBulkReassign] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<AppointmentFilter | undefined>();
  const [activeFilterId, setActiveFilterId] = useState<string | null>(null);
  const dragRef = useRef<DraggedAppointment | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    appt: DraggedAppointment;
    targetDate: Date;
  } | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const weekEnd = addDays(weekStart, 7);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const slotsPerDay = ((HOURS_END - HOURS_START) * 60) / SLOT_MINUTES;
  const slots = useMemo(
    () =>
      Array.from({ length: slotsPerDay }, (_, i) => {
        const totalMinutes = HOURS_START * 60 + i * SLOT_MINUTES;
        return {
          hour: Math.floor(totalMinutes / 60),
          minute: totalMinutes % 60,
        };
      }),
    [slotsPerDay]
  );

  const { data, isLoading, refetch, isFetching } = useAppointments({
    dateFrom: weekStart.toISOString(),
    dateTo: weekEnd.toISOString(),
  });

  const updateAppointment = useUpdateAppointment();

  // Conflict check per il move pendente
  const conflictQuery = useAppointmentConflict({
    brandId: currentBrand?.id,
    assignedSalesUserId: pendingMove?.appt.assignedSalesUserId ?? null,
    scheduledAt: pendingMove?.targetDate.toISOString() ?? null,
    durationMinutes: pendingMove?.appt.durationMinutes ?? null,
    excludeAppointmentId: pendingMove?.appt.id ?? null,
    enabled: !!pendingMove,
  });

  const allAppointments = data?.appointments ?? [];
  const appointments = useMemo(
    () => applyAppointmentFilter(allAppointments, activeFilter, { currentUserId: user?.id }),
    [allAppointments, activeFilter, user?.id]
  );

  const handleDragStart = (e: React.DragEvent, apt: AppointmentWithRelations) => {
    const payload: DraggedAppointment = {
      id: apt.id,
      durationMinutes: apt.duration_minutes,
      assignedSalesUserId: apt.assigned_sales_user_id ?? null,
      scheduledAt: apt.scheduled_at,
    };
    dragRef.current = payload;
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (e: React.DragEvent, day: Date, hour: number, minute: number) => {
    e.preventDefault();
    const dragged = dragRef.current;
    dragRef.current = null;
    if (!dragged) return;
    const target = setMinutes(setHours(startOfDay(day), hour), minute);
    if (target.getTime() === new Date(dragged.scheduledAt).getTime()) return;
    setPendingMove({ appt: dragged, targetDate: target });
  };

  const confirmMove = async () => {
    if (!pendingMove) return;
    try {
      await updateAppointment.mutateAsync({
        appointmentId: pendingMove.appt.id,
        scheduledAt: pendingMove.targetDate.toISOString(),
      });
      toast.success("Appuntamento spostato");
      setPendingMove(null);
      refetch();
    } catch (err) {
      toast.error("Errore durante lo spostamento", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Calendario appuntamenti</h1>
            <p className="text-sm text-muted-foreground">
              Settimana del {format(weekStart, "d MMMM yyyy", { locale: it })}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/5 pl-3 pr-1 py-1">
              <span className="text-xs font-medium text-primary">
                {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
              </span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => setShowBulkReassign(true)}
              >
                <Users className="mr-1.5 h-3.5 w-3.5" />
                Riassegna
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={clearSelection}
                title="Annulla selezione"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <Button variant="outline" size="sm" onClick={() => navigate("/appointments")}>
            <List className="mr-2 h-4 w-4" />
            Vista lista
          </Button>
          <div className="flex items-center rounded-lg border bg-card">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart((d) => subWeeks(d, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
              }
            >
              Oggi
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart((d) => addWeeks(d, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const list = selectedIds.size > 0
                ? appointments.filter((a) => selectedIds.has(a.id))
                : appointments;
              if (list.length === 0) {
                toast.info("Nessun appuntamento da esportare");
                return;
              }
              const n = exportAppointmentsCsv(list, `appuntamenti-settimana-${format(weekStart, "yyyyMMdd")}`);
              toast.success(`Esportati ${n} appuntamenti`);
            }}
            disabled={isLoading}
          >
            <Download className="mr-2 h-4 w-4" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!currentBrand?.id) return;
              const d = new Date(); d.setDate(d.getDate() + 1);
              const iso = d.toISOString().slice(0, 10);
              try {
                const res = await dispatchRouteNow({ brandId: currentBrand.id, routeDate: iso, audience: "both" });
                const r = res?.results?.[0];
                toast.success("Giro inviato", {
                  description: r ? `Individuali: ${r.individual_sent} · Aggregati: ${r.aggregate_sent}` : "OK",
                });
              } catch (e) {
                toast.error("Invio fallito", { description: e instanceof Error ? e.message : undefined });
              }
            }}
          >
            <Send className="mr-2 h-4 w-4" />
            Invia giro di domani
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
          <Button size="sm" onClick={() => setShowNewDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuovo
          </Button>
        </div>
      </div>

      {/* Saved filters bar */}
      <div className="flex items-center justify-between gap-2">
        <SavedFiltersBar
          scope="calendar"
          activeFilter={activeFilter}
          activeFilterId={activeFilterId}
          onChange={(id, f) => {
            setActiveFilterId(id);
            setActiveFilter(f);
          }}
        />
        {activeFilter && Object.keys(activeFilter).length > 0 && (
          <span className="text-xs text-muted-foreground">
            {appointments.length} di {allAppointments.length} mostrati
          </span>
        )}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto rounded-xl border bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : (
          <div className="min-w-[900px]">
            {/* Day headers */}
            <div
              className="sticky top-0 z-10 grid border-b bg-card/95 backdrop-blur"
              style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
            >
              <div />
              {days.map((d) => {
                const isToday = isSameDay(d, new Date());
                return (
                  <div
                    key={d.toISOString()}
                    className={cn(
                      "border-l p-2 text-center text-xs",
                      isToday && "bg-primary/5"
                    )}
                  >
                    <div className="font-medium uppercase text-muted-foreground">
                      {format(d, "EEE", { locale: it })}
                    </div>
                    <div
                      className={cn(
                        "mt-0.5 text-base",
                        isToday ? "font-semibold text-primary" : "text-foreground"
                      )}
                    >
                      {format(d, "d")}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div
              className="grid"
              style={{ gridTemplateColumns: "60px repeat(7, 1fr)" }}
            >
              {/* Time labels column */}
              <div className="border-r">
                {slots.map((s, i) => (
                  <div
                    key={i}
                    className="flex items-start justify-end pr-2 text-[10px] text-muted-foreground"
                    style={{ height: SLOT_PX }}
                  >
                    {s.minute === 0 && (
                      <span>{String(s.hour).padStart(2, "0")}:00</span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {days.map((day) => {
                const dayApts = appointments.filter((a) =>
                  isSameDay(parseISO(a.scheduled_at), day)
                );
                return (
                  <div
                    key={day.toISOString()}
                    className="relative border-l"
                    style={{ height: slotsPerDay * SLOT_PX }}
                  >
                    {/* Drop slots */}
                    {slots.map((s, i) => (
                      <div
                        key={i}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(e) => handleDrop(e, day, s.hour, s.minute)}
                        className={cn(
                          "border-b border-dashed border-transparent transition-colors hover:bg-primary/5",
                          s.minute === 0 && "border-border/40"
                        )}
                        style={{ height: SLOT_PX }}
                      />
                    ))}

                    {/* Appointment cards */}
                    {dayApts.map((apt) => {
                      const dt = parseISO(apt.scheduled_at);
                      const minutesFromStart =
                        (dt.getHours() - HOURS_START) * 60 + dt.getMinutes();
                      const top = (minutesFromStart / SLOT_MINUTES) * SLOT_PX;
                      const height = Math.max(
                        SLOT_PX,
                        (apt.duration_minutes / SLOT_MINUTES) * SLOT_PX - 2
                      );
                      if (top < 0 || top >= slotsPerDay * SLOT_PX) return null;
                      const colorClass =
                        STATUS_COLORS[apt.status] ?? "bg-muted border-border";
                      const contactName = [apt.contact?.first_name, apt.contact?.last_name]
                        .filter(Boolean)
                        .join(" ") || "—";
                      const isSelected = selectedIds.has(apt.id);
                      return (
                        <div
                          key={apt.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, apt)}
                          onClick={(e) => {
                            if (e.metaKey || e.ctrlKey || selectedIds.size > 0) {
                              e.preventDefault();
                              toggleSelect(apt.id);
                            } else {
                              navigate(`/appointments/${apt.id}`);
                            }
                          }}
                          className={cn(
                            "absolute left-1 right-1 cursor-grab overflow-hidden rounded-md border-l-2 px-1.5 py-1 text-[11px] text-white shadow-sm transition hover:shadow-md active:cursor-grabbing",
                            colorClass,
                            isSelected && "ring-2 ring-offset-1 ring-primary"
                          )}
                          style={{ top, height }}
                          title={`${format(dt, "HH:mm")} · ${contactName} (Ctrl/Cmd+click per selezionare)`}
                        >
                          <div className="truncate font-medium">
                            {format(dt, "HH:mm")} · {contactName}
                          </div>
                          {height > SLOT_PX && apt.sales_user?.full_name && (
                            <div className="truncate opacity-90">
                              {apt.sales_user.full_name}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Confirm move dialog (with conflict warning) */}
      {pendingMove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border bg-card p-5 shadow-xl">
            <h3 className="text-base font-semibold">Spostare appuntamento?</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Nuovo orario:{" "}
              <span className="font-medium text-foreground">
                {format(pendingMove.targetDate, "EEE d MMM 'alle' HH:mm", {
                  locale: it,
                })}
              </span>
            </p>

            {conflictQuery.isLoading ? (
              <Skeleton className="mt-4 h-12 w-full" />
            ) : conflictQuery.data && conflictQuery.data.length > 0 ? (
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Conflitto: il commerciale ha già {conflictQuery.data.length}{" "}
                  appuntamento/i sovrapposto/i. Puoi procedere comunque, ma verifica.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPendingMove(null)}
                disabled={updateAppointment.isPending}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                onClick={confirmMove}
                disabled={updateAppointment.isPending}
              >
                {updateAppointment.isPending ? "Sposto…" : "Conferma"}
              </Button>
            </div>
          </div>
        </div>
      )}

      <NewAppointmentDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
      />

      <BulkReassignDialog
        open={showBulkReassign}
        onOpenChange={setShowBulkReassign}
        appointmentIds={Array.from(selectedIds)}
        onDone={() => {
          clearSelection();
          refetch();
        }}
      />
    </div>
  );
}
