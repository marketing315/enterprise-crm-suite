import { format, parseISO } from "date-fns";
import { useNavigate } from "react-router-dom";
import {
  Clock,
  MapPin,
  Phone,
  User,
  Building2,
  Stethoscope,
  Check,
  X,
  Home,
  AlertTriangle,
  MoreHorizontal,
  UserPlus,
  Eye,
} from "lucide-react";
import type { AppointmentStatus, AppointmentType, AppointmentWithRelations } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RiskScoreBadge } from "@/features/appointments/RiskScoreBadge";

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

interface AppointmentCardProps {
  apt: AppointmentWithRelations;
  index?: number;
  showBrand?: boolean;
  onStatusChange: (appointmentId: string, status: AppointmentStatus) => void;
  onAssignSales: (appointmentId: string, salesUserId: string) => void;
  salesUsers: Array<{ user_id: string; full_name: string | null; email: string }>;
}

export function AppointmentCard({
  apt,
  index = 0,
  showBrand = false,
  onStatusChange,
  onAssignSales,
  salesUsers,
}: AppointmentCardProps) {
  const navigate = useNavigate();
  const contactName = [apt.contact?.first_name, apt.contact?.last_name]
    .filter(Boolean)
    .join(" ") || "Senza nome";

  const typeConfig = apt.appointment_type ? APPOINTMENT_TYPE_CONFIG[apt.appointment_type] : null;
  const statusConfig = STATUS_CONFIG[apt.status];

  return (
    <div
      className="group relative rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm p-3 mb-2 transition-all duration-200 hover:shadow-md hover:scale-[1.01] hover:border-border animate-fade-in"
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: "both" }}
    >
      <div className="flex items-start gap-3">
        {/* Time column */}
        <div className="flex flex-col items-center shrink-0 pt-0.5">
          <span className="text-sm font-semibold tabular-nums">
            {format(parseISO(apt.scheduled_at), "HH:mm")}
          </span>
          <span className="text-[10px] text-muted-foreground">{apt.duration_minutes}min</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Top row: type pill + status dot */}
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${statusConfig.color}`} />
            <span className="text-[11px] text-muted-foreground">{statusConfig.label}</span>
            {typeConfig && (
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-medium border ${typeConfig.className}`}>
                {typeConfig.label}
              </Badge>
            )}
            <RiskScoreBadge score={apt.risk_score} />
          </div>

          {/* Contact name */}
          <p className="font-medium text-sm truncate">{contactName}</p>

          {/* Details */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {apt.contact?.primary_phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {apt.contact.primary_phone}
              </span>
            )}
            {apt.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {apt.city}
              </span>
            )}
            {apt.sales_user && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {apt.sales_user.full_name || apt.sales_user.email}
              </span>
            )}
          </div>

          {/* Brand badge */}
          {showBrand && apt.brand_name && (
            <Badge variant="outline" className="text-[10px] bg-muted/50 h-4 px-1.5 py-0">
              <Building2 className="h-2.5 w-2.5 mr-1" />
              {apt.brand_name}
            </Badge>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => navigate(`/appointments/${apt.id}`)}>
              <Eye className="h-3.5 w-3.5 mr-2" /> Dettagli
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs">Stato</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => onStatusChange(apt.id, "confirmed")}
              disabled={apt.status === "confirmed"}
            >
              <Check className="h-3.5 w-3.5 mr-2 text-emerald-500" />
              Conferma
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStatusChange(apt.id, "visited")}
              disabled={apt.status === "visited"}
            >
              <Home className="h-3.5 w-3.5 mr-2 text-primary" />
              Visitato
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStatusChange(apt.id, "cancelled")}
              disabled={apt.status === "cancelled"}
            >
              <X className="h-3.5 w-3.5 mr-2 text-destructive" />
              Annulla
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onStatusChange(apt.id, "no_show")}
              disabled={apt.status === "no_show"}
            >
              <AlertTriangle className="h-3.5 w-3.5 mr-2 text-destructive" />
              Non presentato
            </DropdownMenuItem>

            {salesUsers.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Assegnazione</DropdownMenuLabel>
                {salesUsers.map((user) => (
                  <DropdownMenuItem
                    key={user.user_id}
                    onClick={() => onAssignSales(apt.id, user.user_id)}
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
      </div>
    </div>
  );
}
