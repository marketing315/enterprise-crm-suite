import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  format,
  startOfWeek,
  addDays,
  parseISO,
  addWeeks,
  subWeeks,
  isWithinInterval,
  isSameDay,
} from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  Building2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  MapPin,
  User,
  Phone,
  Check,
  X,
  Home,
  AlertTriangle,
  UserPlus,
  MoreHorizontal,
  Eye,
} from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAppointments, useSetAppointmentStatus, useAssignAppointmentSales } from "@/hooks/useAppointments";
import { useBrandOperators } from "@/hooks/useBrandOperators";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations } from "@/types/database";

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewAppointmentDialog } from "@/components/appointments/NewAppointmentDialog";
import { AppointmentWeekStats } from "@/components/appointments/AppointmentWeekStats";

const STATUS_FILTERS: { value: AppointmentStatus | "all"; label: string }[] = [
  { value: "all", label: "Tutti" },
  { value: "scheduled", label: "Programmati" },
  { value: "confirmed", label: "Confermati" },
  { value: "visited", label: "Visitati" },
  { value: "cancelled", label: "Annullati" },
  { value: "no_show", label: "No show" },
];

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; color: string }> = {
  scheduled: { label: "Programmato", color: "bg-amber-400" },
  confirmed: { label: "Confermato", color: "bg-emerald-400" },
  cancelled: { label: "Annullato", color: "bg-destructive" },
  rescheduled: { label: "Riprogrammato", color: "bg-blue-400" },
  visited: { label: "Visitato", color: "bg-primary" },
  no_show: { label: "Non presentato", color: "bg-destructive" },
};

const APPOINTMENT_TYPE_CONFIG: Record<AppointmentType, { label: string; className: string }> = {
  primo_appuntamento: { label: "Primo", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  follow_up: { label: "Follow-up", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  visita_tecnica: { label: "Visita Tecnica", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

type SortField = "date" | "contact" | "status" | "city" | "sales";
type SortDir = "asc" | "desc";

export default function Appointments() {
  const navigate = useNavigate();
  const { currentBrand, hasBrandSelected, isAllBrandsSelected, brands } = useBrand();
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(new Date(), { weekStartsOn: 1 })
  );
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [salesFilter, setSalesFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  // Sort appointments
  const sortedAppointments = useMemo(() => {
    const sorted = [...appointments].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
          break;
        case "contact": {
          const nameA = [a.contact?.first_name, a.contact?.last_name].filter(Boolean).join(" ").toLowerCase();
          const nameB = [b.contact?.first_name, b.contact?.last_name].filter(Boolean).join(" ").toLowerCase();
          cmp = nameA.localeCompare(nameB);
          break;
        }
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "city":
          cmp = (a.city || "").localeCompare(b.city || "");
          break;
        case "sales": {
          const sA = a.sales_user?.full_name || a.sales_user?.email || "";
          const sB = b.sales_user?.full_name || b.sales_user?.email || "";
          cmp = sA.localeCompare(sB);
          break;
        }
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [appointments, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

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

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-primary" />
      : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

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
          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setWeekStart(subWeeks(weekStart, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant={isCurrentWeek ? "secondary" : "outline"}
            size="sm"
            className="rounded-xl"
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
          >
            Oggi
          </Button>
          <Button variant="outline" size="icon" className="rounded-xl" onClick={() => setWeekStart(addWeeks(weekStart, 1))}>
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

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
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

        {isAllBrandsSelected && (
          <Select value={brandFilter} onValueChange={setBrandFilter}>
            <SelectTrigger className="w-[160px] h-8 text-xs rounded-xl">
              <Building2 className="h-3.5 w-3.5 mr-1.5" />
              <SelectValue placeholder="Brand" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i brand</SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

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

      {/* Data Table */}
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : sortedAppointments.length === 0 ? (
        <WeekEmptyState onNewAppointment={() => setDialogOpen(true)} />
      ) : (
        <div className="rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort("date")} className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Data / Ora
                      <SortIcon field="date" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort("contact")} className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Contatto
                      <SortIcon field="contact" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => toggleSort("status")} className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Stato
                      <SortIcon field="status" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">
                    <span className="text-xs font-medium text-muted-foreground">Tipo</span>
                  </th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <button onClick={() => toggleSort("city")} className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Città
                      <SortIcon field="city" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <button onClick={() => toggleSort("sales")} className="flex items-center text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                      Venditore
                      <SortIcon field="sales" />
                    </button>
                  </th>
                  {isAllBrandsSelected && (
                    <th className="text-left px-4 py-3 hidden xl:table-cell">
                      <span className="text-xs font-medium text-muted-foreground">Brand</span>
                    </th>
                  )}
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {sortedAppointments.map((apt, idx) => {
                  const contactName = [apt.contact?.first_name, apt.contact?.last_name].filter(Boolean).join(" ") || "Senza nome";
                  const statusCfg = STATUS_CONFIG[apt.status];
                  const typeCfg = apt.appointment_type ? APPOINTMENT_TYPE_CONFIG[apt.appointment_type] : null;
                  const isToday = isSameDay(parseISO(apt.scheduled_at), today);

                  return (
                    <tr
                      key={apt.id}
                      className="border-b border-border/30 last:border-0 hover:bg-accent/30 transition-colors animate-fade-in"
                      style={{ animationDelay: `${idx * 30}ms`, animationFillMode: "both" }}
                    >
                      {/* Date / Time */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className={`text-sm font-medium tabular-nums ${isToday ? "text-primary" : ""}`}>
                            {format(parseISO(apt.scheduled_at), "HH:mm")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(apt.scheduled_at), "EEE d MMM", { locale: it })}
                          </span>
                        </div>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            <span className="text-[10px] font-medium">
                              {(apt.contact?.first_name?.[0] || "").toUpperCase()}
                              {(apt.contact?.last_name?.[0] || "").toUpperCase()}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{contactName}</p>
                            {apt.contact?.primary_phone && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1">
                                <Phone className="h-2.5 w-2.5" />
                                {apt.contact.primary_phone}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${statusCfg.color}`} />
                          <span className="text-xs">{statusCfg.label}</span>
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3 hidden md:table-cell">
                        {typeCfg ? (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 font-medium border ${typeCfg.className}`}>
                            {typeCfg.label}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* City */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {apt.city ? (
                          <span className="text-xs flex items-center gap-1 text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            {apt.city}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Sales */}
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {apt.sales_user ? (
                          <span className="text-xs flex items-center gap-1 text-muted-foreground">
                            <User className="h-3 w-3" />
                            {apt.sales_user.full_name || apt.sales_user.email}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Brand */}
                      {isAllBrandsSelected && (
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {apt.brand_name ? (
                            <Badge variant="outline" className="text-[10px] bg-muted/50 h-5 px-1.5 py-0">
                              <Building2 className="h-2.5 w-2.5 mr-1" />
                              {apt.brand_name}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="px-2 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => navigate(`/appointments/${apt.id}`)}>
                              <Eye className="h-3.5 w-3.5 mr-2" /> Dettagli
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs">Stato</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, "confirmed")} disabled={apt.status === "confirmed"}>
                              <Check className="h-3.5 w-3.5 mr-2 text-emerald-500" /> Conferma
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, "visited")} disabled={apt.status === "visited"}>
                              <Home className="h-3.5 w-3.5 mr-2 text-primary" /> Visitato
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, "cancelled")} disabled={apt.status === "cancelled"}>
                              <X className="h-3.5 w-3.5 mr-2 text-destructive" /> Annulla
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(apt.id, "no_show")} disabled={apt.status === "no_show"}>
                              <AlertTriangle className="h-3.5 w-3.5 mr-2 text-destructive" /> Non presentato
                            </DropdownMenuItem>

                            {salesUsers.length > 0 && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-xs">Assegnazione</DropdownMenuLabel>
                                {salesUsers.map((user) => (
                                  <DropdownMenuItem
                                    key={user.user_id}
                                    onClick={() => handleAssignSales(apt.id, user.user_id)}
                                    disabled={apt.assigned_sales_user_id === user.user_id}
                                  >
                                    <UserPlus className="h-3.5 w-3.5 mr-2" />
                                    {user.full_name || user.email}
                                  </DropdownMenuItem>
                                ))}
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <NewAppointmentDialog open={dialogOpen} onOpenChange={setDialogOpen} />
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
