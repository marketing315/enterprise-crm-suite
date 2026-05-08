import { useState, useMemo } from "react";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { ArrowLeft, Plus, Trash2, Calendar as CalendarIcon, Clock, Users, TrendingUp, Plane } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
  DialogDescription} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamMembers } from "@/hooks/useTeam";
import {
  useSalesAvailability,
  useSalesTimeOff,
  useSalesCapacity,
  useCreateAvailabilitySlot,
  useDeleteAvailabilitySlot,
  useCreateTimeOff,
  useDeleteTimeOff,
  WEEKDAY_LABELS,
  WEEKDAY_LABELS_SHORT,
  type SalesCapacityRow,
} from "@/features/appointments/useSalesAvailability";
import { toast } from "sonner";

export default function SalesAvailability() {
  const navigate = useNavigate();
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [slotDialogOpen, setSlotDialogOpen] = useState(false);
  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);

  const { data: salesUsers = [] } = useTeamMembers("venditore");
  const { data: managerUsers = [] } = useTeamMembers("responsabile_venditori");
  const allSales = useMemo(
    () => [...managerUsers, ...salesUsers],
    [salesUsers, managerUsers]
  );

  // Default selected = first sales user
  if (!selectedUserId && allSales.length > 0) {
    setSelectedUserId(allSales[0].user_id);
  }

  const { data: slots = [], isLoading: slotsLoading } = useSalesAvailability(selectedUserId || undefined);
  const { data: timeOffs = [], isLoading: timeOffLoading } = useSalesTimeOff(selectedUserId || undefined);

  // Current week capacity for everyone
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const weekEnd = useMemo(() => endOfWeek(new Date(), { weekStartsOn: 1 }), []);
  const { data: capacity = [], isLoading: capacityLoading } = useSalesCapacity(
    format(weekStart, "yyyy-MM-dd"),
    format(weekEnd, "yyyy-MM-dd")
  );

  return (
    <div className="space-y-6 animate-fade-in p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Disponibilità venditori</h1>
          <p className="text-sm text-muted-foreground">
            Turni settimanali, ferie e capacità della settimana corrente
          </p>
        </div>
      </div>

      {/* Capacity overview */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Capacità settimana corrente · {format(weekStart, "d MMM", { locale: it })} – {format(weekEnd, "d MMM", { locale: it })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {capacityLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : capacity.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun venditore configurato.</p>
          ) : (
            <div className="space-y-2">
              {capacity.map((row) => <CapacityRow key={row.user_id} row={row} />)}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-user editor */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Configurazione venditore
          </CardTitle>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Seleziona venditore" />
            </SelectTrigger>
            <SelectContent>
              {allSales.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {u.full_name || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {!selectedUserId ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Seleziona un venditore per configurarne i turni.
            </p>
          ) : (
            <Tabs defaultValue="slots">
              <TabsList>
                <TabsTrigger value="slots">
                  <Clock className="h-3.5 w-3.5 mr-1.5" />
                  Turni settimanali
                </TabsTrigger>
                <TabsTrigger value="timeoff">
                  <Plane className="h-3.5 w-3.5 mr-1.5" />
                  Ferie e permessi
                </TabsTrigger>
              </TabsList>

              <TabsContent value="slots" className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">
                    {slots.length} slot configurati
                  </p>
                  <Dialog open={slotDialogOpen} onOpenChange={setSlotDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="default">
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Nuovo turno
                      </Button>
                    </DialogTrigger>
                    <NewSlotDialog
                      userId={selectedUserId}
                      onClose={() => setSlotDialogOpen(false)}
                    />
                  </Dialog>
                </div>
                <SlotsTable slots={slots} loading={slotsLoading} />
              </TabsContent>

              <TabsContent value="timeoff" className="mt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">
                    {timeOffs.length} periodi di assenza futuri
                  </p>
                  <Dialog open={timeOffDialogOpen} onOpenChange={setTimeOffDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="default">
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Nuovo periodo
                      </Button>
                    </DialogTrigger>
                    <NewTimeOffDialog
                      userId={selectedUserId}
                      onClose={() => setTimeOffDialogOpen(false)}
                    />
                  </Dialog>
                </div>
                <TimeOffTable timeOffs={timeOffs} loading={timeOffLoading} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============= SUB-COMPONENTS =============

function CapacityRow({ row }: { row: SalesCapacityRow }) {
  const pct = row.utilization_pct ?? 0;
  const tone =
    pct >= 90 ? "bg-destructive" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500";
  const availableHours = (row.available_minutes / 60).toFixed(1);
  const bookedHours = (row.booked_minutes / 60).toFixed(1);

  return (
    <div className="flex items-center gap-4 p-3 rounded-lg border bg-card/50">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{row.full_name || row.email}</p>
        <p className="text-xs text-muted-foreground">
          {bookedHours}h occupate / {availableHours}h disponibili · {row.appointment_count} appuntamenti
        </p>
      </div>
      <div className="w-32 shrink-0">
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full transition-all ${tone}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <p className="text-[10px] text-right mt-0.5 text-muted-foreground tabular-nums">
          {row.utilization_pct === null ? "Nessun turno" : `${pct}%`}
        </p>
      </div>
    </div>
  );
}

function SlotsTable({
  slots,
  loading,
}: {
  slots: ReturnType<typeof useSalesAvailability>["data"];
  loading: boolean;
}) {
  const deleteSlot = useDeleteAvailabilitySlot();

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!slots || slots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nessun turno configurato. Aggiungine uno per definire le ore di disponibilità.
      </p>
    );
  }

  // Group by weekday
  const byWeekday = new Map<number, typeof slots>();
  slots.forEach((s) => {
    const arr = byWeekday.get(s.weekday) ?? [];
    arr.push(s);
    byWeekday.set(s.weekday, arr);
  });

  // Show Mon-Sun (1..6, 0)
  const order = [1, 2, 3, 4, 5, 6, 0];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2">
      {order.map((wd) => {
        const daySlots = byWeekday.get(wd) ?? [];
        return (
          <div key={wd} className="rounded-lg border bg-card/50 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{WEEKDAY_LABELS_SHORT[wd]}</p>
            {daySlots.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic">—</p>
            ) : (
              daySlots.map((s) => (
                <div
                  key={s.id}
                  className="group flex items-center justify-between text-xs bg-background rounded px-2 py-1 border"
                >
                  <span className="tabular-nums">
                    {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 opacity-0 group-hover:opacity-100"
                    onClick={() => {
                      if (confirm("Eliminare questo turno?")) {
                        deleteSlot.mutate(s.id, {
                          onSuccess: () => toast.success("Turno eliminato"),
                          onError: (e) => toast.error(e.message),
                        });
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimeOffTable({
  timeOffs,
  loading,
}: {
  timeOffs: ReturnType<typeof useSalesTimeOff>["data"];
  loading: boolean;
}) {
  const deleteTimeOff = useDeleteTimeOff();
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!timeOffs || timeOffs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nessun periodo di assenza programmato.
      </p>
    );
  }

  const TYPE_LABELS: Record<string, string> = {
    vacation: "Ferie",
    sick: "Malattia",
    personal: "Permesso",
    training: "Formazione",
    other: "Altro",
  };

  return (
    <div className="space-y-2">
      {timeOffs.map((t) => (
        <div
          key={t.id}
          className="group flex items-center justify-between gap-3 p-3 rounded-lg border bg-card/50"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Plane className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {format(new Date(t.start_date), "d MMM yyyy", { locale: it })}
                {t.start_date !== t.end_date && ` → ${format(new Date(t.end_date), "d MMM yyyy", { locale: it })}`}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px]">
                  {TYPE_LABELS[t.off_type]}
                </Badge>
                {t.reason && <span className="text-xs text-muted-foreground truncate">{t.reason}</span>}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
            onClick={() => {
              if (confirm("Eliminare questo periodo di assenza?")) {
                deleteTimeOff.mutate(t.id, {
                  onSuccess: () => toast.success("Periodo eliminato"),
                  onError: (e) => toast.error(e.message),
                });
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function NewSlotDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [weekday, setWeekday] = useState<string>("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const create = useCreateAvailabilitySlot();

  const submit = () => {
    if (endTime <= startTime) {
      toast.error("L'ora di fine deve essere successiva all'ora di inizio");
      return;
    }
    create.mutate(
      { userId, weekday: parseInt(weekday), startTime, endTime },
      {
        onSuccess: () => {
          toast.success("Turno aggiunto");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuovo turno settimanale</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label>Giorno della settimana</Label>
          <Select value={weekday} onValueChange={setWeekday}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
                <SelectItem key={wd} value={String(wd)}>{WEEKDAY_LABELS[wd]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Dalle</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Alle</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Salvataggio..." : "Aggiungi"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewTimeOffDialog({ userId, onClose }: { userId: string; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [offType, setOffType] = useState<"vacation" | "sick" | "personal" | "training" | "other">("vacation");
  const [reason, setReason] = useState("");
  const create = useCreateTimeOff();

  const submit = () => {
    if (endDate < startDate) {
      toast.error("La data di fine deve essere successiva o uguale a quella di inizio");
      return;
    }
    create.mutate(
      { userId, startDate, endDate, offType, reason: reason || null },
      {
        onSuccess: () => {
          toast.success("Periodo aggiunto");
          onClose();
        },
        onError: (e) => toast.error(e.message),
      }
    );
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Nuovo periodo di assenza</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Dal</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Al</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={offType} onValueChange={(v) => setOffType(v as typeof offType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="vacation">Ferie</SelectItem>
              <SelectItem value="sick">Malattia</SelectItem>
              <SelectItem value="personal">Permesso</SelectItem>
              <SelectItem value="training">Formazione</SelectItem>
              <SelectItem value="other">Altro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Note (opzionale)</Label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Es: Vacanze estive" />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>Annulla</Button>
        <Button onClick={submit} disabled={create.isPending}>
          {create.isPending ? "Salvataggio..." : "Aggiungi"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
