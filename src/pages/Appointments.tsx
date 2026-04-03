import { useState, useMemo } from "react";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
  isWithinInterval,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Building2,
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointments, useSetAppointmentStatus, useAssignAppointmentSales } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AppointmentStatus, AppointmentWithRelations } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";
import { AppointmentCard } from "@/components/appointments/AppointmentCard";
import { AppointmentDaySelector } from "@/components/appointments/AppointmentDaySelector";
import { AppointmentWeekStats } from "@/components/appointments/AppointmentWeekStats";

const STATUS_FILTERS: { value: AppointmentStatus | "all"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "scheduled", label: "Programmati" },
  { value: "confirmed", label: "Confermati" },
  { value: "visited", label: "Visitati" },
  { value: "cancelled", label: "Annullati" },
  { value: "no_show", label: "No show" },
];

export default function Appointments() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected, brands } = useBrand();
  const isMobile = useIsMobile();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedMobileDay, setSelectedMobileDay] = useState(new Date());

  const weekEnd = addDays(weekStart, 6);

  const { data, isLoading, refetch } = useAppointments({
    dateFrom: weekStart.toISOString(),
    dateTo: weekEnd.toISOString(),
    status: statusFilter !== "all" ? statusFilter : undefined,
    salesUserId: salesFilter !== "all" ? salesFilter : undefined,
    brandId: brandFilter !== "all" ? brandFilter : undefined,
  });

  const { data: operators } = useBrandOperators();
  const salesUsers = operators?.filter((op) => op.role === "sales") || [];

  const setStatus = useSetAppointmentStatus();
  const assignSales = useAssignAppointmentSales();

  const appointments = data?.appointments || [];

  // Group appointments by day
  const appointmentsByDay = useMemo(() => {
    const days: Record<string, AppointmentWithRelations[]> = {};
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const key = format(day, "yyyy-MM-dd");
      days[key] = [];
    }

    appointments.forEach((apt) => {
      const key = format(parseISO(apt.scheduled_at), "yyyy-MM-dd");
      if (days[key]) {
        days[key].push(apt);
      }
    });

    Object.keys(days).forEach((key) => {
      days[key].sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    });

    return days;
  }, [appointments, weekStart]);

  // Count per day for mobile selector
  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.entries(appointmentsByDay).forEach(([key, apts]) => {
      counts[key] = apts.length;
    });
    return counts;
  }, [appointmentsByDay]);

  const handleStatusChange = async (appointmentId: string, status: AppointmentStatus) => {
    await setStatus.mutateAsync({ appointmentId, status });
  };

  const handleAssignSales = async (appointmentId: string, salesUserId: string) => {
    await assignSales.mutateAsync({ appointmentId, salesUserId });
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

  const today = new Date();
  const isCurrentWeek = isWithinInterval(today, { start: weekStart, end: weekEnd });

  // Mobile: show only selected day
  const mobileDayKey = format(selectedMobileDay, "yyyy-MM-dd");
  const mobileDayAppointments = appointmentsByDay[mobileDayKey] || [];

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 backdrop-blur-sm border border-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Appuntamenti</h1>
              {appointments.length > 0 && (
                <Badge variant="secondary" className="rounded-full tabular-nums">
                  {appointments.length}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, "d MMMM", { locale: it })} –{" "}
              {format(weekEnd, "d MMMM yyyy", { locale: it })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isCurrentWeek ? "secondary" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => {
              setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
              setSelectedMobileDay(new Date());
            }}
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)} className="rounded-xl">
            <Plus className="h-4 w-4 mr-2" />
            Nuovo
          </Button>
        </div>
      </div>

      {/* Filters row: chip toggles for status + dropdown for brand/sales */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Status chip filters */}
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_FILTERS.map((sf) => (
            <button
              key={sf.value}
              onClick={() => setStatusFilter(sf.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-all duration-200 ${
                statusFilter === sf.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/60 text-secondary-foreground hover:bg-secondary"
              }`}
            >
              {sf.label}
            </button>
          ))}
        </div>

        {/* Brand filter in All Brands mode */}
        {isAllBrandsSelected && (
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs rounded-xl">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i brand</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Sales filter */}
        {salesUsers.length > 0 && (
          <Select value={salesFilter} onValueChange={setSalesFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs rounded-xl">
              <SelectValue placeholder="Venditore" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i venditori</SelectItem>
              {salesUsers.map((user) => (
                <SelectItem key={user.user_id} value={user.user_id}>
                  {user.full_name || user.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Week stats */}
      {!isLoading && <AppointmentWeekStats appointments={appointments} />}

      {/* Week View */}
      {isLoading ? (
        <div className={`grid gap-2 ${isMobile ? "grid-cols-1" : "grid-cols-7"}`}>
          {[...Array(isMobile ? 3 : 7)].map((_, i) => (
            <Skeleton key={i} className="h-[200px] rounded-xl" />
          ))}
        </div>
      ) : isMobile ? (
        /* Mobile: Day selector + list */
        <div className="space-y-3">
          <AppointmentDaySelector
            weekStart={weekStart}
            selectedDay={selectedMobileDay}
            onSelectDay={setSelectedMobileDay}
            appointmentCounts={appointmentCounts}
          />

          <div className="min-h-[200px]">
            {mobileDayAppointments.length === 0 ? (
              <EmptyDayState onNewAppointment={() => setDialogOpen(true)} />
            ) : (
              mobileDayAppointments.map((apt, idx) => (
                <AppointmentCard
                  key={apt.id}
                  apt={apt}
                  index={idx}
                  showBrand={isAllBrandsSelected}
                  onStatusChange={handleStatusChange}
                  onAssignSales={handleAssignSales}
                  salesUsers={salesUsers}
                />
              ))
            )}
          </div>
        </div>
      ) : (
        /* Desktop: 7 column grid */
        <div className="grid grid-cols-7 gap-2">
          {Object.entries(appointmentsByDay).map(([dateKey, dayAppointments]) => {
            const date = parseISO(dateKey);
            const isToday = isSameDay(date, today);

            return (
              <div
                key={dateKey}
                className={`rounded-xl border bg-card/50 backdrop-blur-sm transition-all duration-200 ${
                  isToday ? "border-primary/30 ring-1 ring-primary/20" : "border-border/50"
                }`}
              >
                {/* Day header */}
                <div className="px-3 py-2 border-b border-border/30">
                  <p className="text-[10px] uppercase font-medium text-muted-foreground tracking-wider">
                    {format(date, "EEEE", { locale: it })}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className={`text-lg font-semibold ${isToday ? "text-primary" : ""}`}>
                      {format(date, "d")}
                    </span>
                    {dayAppointments.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5 rounded-full tabular-nums">
                        {dayAppointments.length}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Appointments */}
                <ScrollArea className="h-[calc(100vh-22rem)]">
                  <div className="p-1.5">
                    {/* Now indicator */}
                    {isToday && <NowIndicator />}

                    {dayAppointments.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground text-center py-8 opacity-50">
                        Nessun appuntamento
                      </p>
                    ) : (
                      dayAppointments.map((apt, idx) => (
                        <AppointmentCard
                          key={apt.id}
                          apt={apt}
                          index={idx}
                          showBrand={isAllBrandsSelected}
                          onStatusChange={handleStatusChange}
                          onAssignSales={handleAssignSales}
                          salesUsers={salesUsers}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state for entire week */}
      {!isLoading && appointments.length === 0 && (
        <WeekEmptyState onNewAppointment={() => setDialogOpen(true)} />
      )}

      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function NowIndicator() {
  return (
    <div className="relative flex items-center mb-2">
      <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
      <div className="flex-1 h-px bg-destructive/40" />
      <span className="text-[9px] text-destructive font-medium pl-1">ORA</span>
    </div>
  );
}

function EmptyDayState({ onNewAppointment }: { onNewAppointment: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="relative mb-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/5 flex items-center justify-center">
          <Calendar className="h-8 w-8 text-primary/30" />
        </div>
        <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary/10" />
        <div className="absolute -bottom-2 -left-2 h-6 w-6 rounded-full bg-primary/5" />
      </div>
      <p className="text-sm text-muted-foreground mb-3">Nessun appuntamento per oggi</p>
      <Button variant="outline" size="sm" className="rounded-xl" onClick={onNewAppointment}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        Nuovo appuntamento
      </Button>
    </div>
  );
}

function WeekEmptyState({ onNewAppointment }: { onNewAppointment: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      <div className="relative mb-6">
        <div className="h-20 w-20 rounded-3xl bg-primary/5 flex items-center justify-center">
          <Calendar className="h-10 w-10 text-primary/25" />
        </div>
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-primary/10" />
        <div className="absolute -bottom-3 -left-3 h-8 w-8 rounded-full bg-primary/5" />
        <div className="absolute top-1/2 -right-5 h-3 w-3 rounded-full bg-primary/10" />
      </div>
      <h3 className="text-lg font-medium mb-1">Nessun appuntamento questa settimana</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Pianifica il primo appuntamento per iniziare
      </p>
      <Button className="rounded-xl" onClick={onNewAppointment}>
        <Plus className="h-4 w-4 mr-2" />
        Nuovo appuntamento
      </Button>
    </div>
  );
}
