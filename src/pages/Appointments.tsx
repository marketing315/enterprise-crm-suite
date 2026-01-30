import { useState, useMemo } from "react";
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  parseISO,
  addWeeks,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  User,
  Clock,
  MapPin,
  Phone,
  Building2,
  Stethoscope,
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointments, useSetAppointmentStatus, useAssignAppointmentSales } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations } from "@/types/database";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "Programmato", variant: "secondary" },
  confirmed: { label: "Confermato", variant: "default" },
  cancelled: { label: "Annullato", variant: "destructive" },
  rescheduled: { label: "Riprogrammato", variant: "outline" },
  visited: { label: "Visitato", variant: "default" },
  no_show: { label: "Non presentato", variant: "destructive" },
};

const APPOINTMENT_TYPE_CONFIG: Record<AppointmentType, { label: string; color: string }> = {
  primo_appuntamento: { label: "Primo", color: "bg-blue-100 text-blue-700 border-blue-300" },
  follow_up: { label: "Follow-up", color: "bg-amber-100 text-amber-700 border-amber-300" },
  visita_tecnica: { label: "Visita Tecnica", color: "bg-purple-100 text-purple-700 border-purple-300" },
};

export default function Appointments() {
  const { currentBrand, hasBrandSelected, isAllBrandsSelected, brands } = useBrand();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);

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

    // Sort by time
    Object.keys(days).forEach((key) => {
      days[key].sort(
        (a, b) =>
          new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
      );
    });

    return days;
  }, [appointments, weekStart]);

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

  const AppointmentCard = ({ apt }: { apt: AppointmentWithRelations }) => {
    const contactName = [apt.contact?.first_name, apt.contact?.last_name]
      .filter(Boolean)
      .join(" ") || "Senza nome";

    const typeConfig = apt.appointment_type ? APPOINTMENT_TYPE_CONFIG[apt.appointment_type] : null;

    return (
      <Card className="mb-2">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={STATUS_CONFIG[apt.status].variant}>
                  {STATUS_CONFIG[apt.status].label}
                </Badge>
                {typeConfig && (
                  <Badge variant="outline" className={typeConfig.color}>
                    <Stethoscope className="h-3 w-3 mr-1" />
                    {typeConfig.label}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  <Clock className="h-3 w-3 inline mr-1" />
                  {format(parseISO(apt.scheduled_at), "HH:mm")} - {apt.duration_minutes}min
                </span>
              </div>
              {/* Brand badge in "All Brands" mode */}
              {isAllBrandsSelected && apt.brand_name && (
                <div className="flex items-center gap-1">
                  <Badge variant="outline" className="text-xs bg-muted/50">
                    <Building2 className="h-3 w-3 mr-1" />
                    {apt.brand_name}
                  </Badge>
                </div>
              )}
              <p className="font-medium text-sm truncate">{contactName}</p>
              {apt.contact?.primary_phone && (
                <p className="text-xs text-muted-foreground">
                  <Phone className="h-3 w-3 inline mr-1" />
                  {apt.contact.primary_phone}
                </p>
              )}
              {apt.city && (
                <p className="text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3 inline mr-1" />
                  {apt.city}
                </p>
              )}
              {apt.sales_user && (
                <p className="text-xs text-muted-foreground">
                  <User className="h-3 w-3 inline mr-1" />
                  {apt.sales_user.full_name || apt.sales_user.email}
                </p>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  •••
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => handleStatusChange(apt.id, "confirmed")}
                  disabled={apt.status === "confirmed"}
                >
                  ✓ Conferma
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange(apt.id, "cancelled")}
                  disabled={apt.status === "cancelled"}
                >
                  ✗ Annulla
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange(apt.id, "visited")}
                  disabled={apt.status === "visited"}
                >
                  🏠 Visitato
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange(apt.id, "no_show")}
                  disabled={apt.status === "no_show"}
                >
                  ⚠️ Non presentato
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {salesUsers.map((user) => (
                  <DropdownMenuItem
                    key={user.user_id}
                    onClick={() => handleAssignSales(apt.id, user.user_id)}
                    disabled={apt.assigned_sales_user_id === user.user_id}
                  >
                    Assegna a {user.full_name || user.email}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Calendar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Appuntamenti</h1>
            <p className="text-sm text-muted-foreground">
              {format(weekStart, "d MMMM", { locale: it })} -{" "}
              {format(weekEnd, "d MMMM yyyy", { locale: it })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(subWeeks(weekStart, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Oggi
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setWeekStart(addWeeks(weekStart, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Brand filter - only in "All Brands" mode */}
        {isAllBrandsSelected && (
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[180px]">
              <Building2 className="h-4 w-4 mr-2" />
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

        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as AppointmentStatus | "all")}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <SelectItem key={key} value={key}>
                {config.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={salesFilter} onValueChange={setSalesFilter}>
          <SelectTrigger className="w-[180px]">
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
      </div>

      {/* Week View */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-2">
          {[...Array(7)].map((_, i) => (
            <Skeleton key={i} className="h-[300px]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {Object.entries(appointmentsByDay).map(([dateKey, dayAppointments]) => {
            const date = parseISO(dateKey);
            const isToday = isSameDay(date, new Date());

            return (
              <Card key={dateKey} className={isToday ? "ring-2 ring-primary" : ""}>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-medium">
                    <span className="block text-xs text-muted-foreground uppercase">
                      {format(date, "EEE", { locale: it })}
                    </span>
                    <span className={isToday ? "text-primary" : ""}>
                      {format(date, "d MMM", { locale: it })}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 min-h-[200px]">
                  {dayAppointments.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      Nessun appuntamento
                    </p>
                  ) : (
                    dayAppointments.map((apt) => (
                      <AppointmentCard key={apt.id} apt={apt} />
                    ))
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New Appointment Dialog */}
      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
