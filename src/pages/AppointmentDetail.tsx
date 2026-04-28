import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Phone,
  Mail,
  User,
  Building2,
  FileText,
  Briefcase,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RiskScoreBadge } from "@/features/appointments/RiskScoreBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppointmentStatus, AppointmentType } from "@/types/database";
import { AppointmentOutcomeDialog } from "@/features/appointments/AppointmentOutcomeDialog";
import { useAppointmentOutcomes } from "@/features/appointments/useAppointmentOutcomes";
import { getOutcomeMeta, getStatusMeta } from "@/features/appointments/taxonomy";
import { AppointmentTimeline } from "@/features/appointments/AppointmentTimeline";

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
  scheduled: { label: "Programmato", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  confirmed: { label: "Confermato", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" },
  cancelled: { label: "Annullato", className: "bg-destructive/10 text-destructive border-destructive/20" },
  rescheduled: { label: "Riprogrammato", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  visited: { label: "Visitato", className: "bg-primary/10 text-primary border-primary/20" },
  no_show: { label: "Non presentato", className: "bg-destructive/10 text-destructive border-destructive/20" },
};

const TYPE_CONFIG: Record<AppointmentType, { label: string; className: string }> = {
  primo_appuntamento: { label: "Primo Appuntamento", className: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
  follow_up: { label: "Follow-up", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
  visita_tecnica: { label: "Visita Tecnica", className: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
};

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

export default function AppointmentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [outcomeOpen, setOutcomeOpen] = useState(false);

  const { data: apt, isLoading } = useQuery({
    queryKey: ["appointment-detail", id],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from("appointments") as any)
        .select(`
          *,
          contacts:contact_id (
            id, first_name, last_name, phone, email
          ),
          brands:brand_id (
            id, name
          )
        `)
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: outcomes = [] } = useAppointmentOutcomes(id);

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!apt) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Appuntamento non trovato</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/appointments")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Torna agli appuntamenti
        </Button>
      </div>
    );
  }

  const contactName = [apt.contacts?.first_name, apt.contacts?.last_name].filter(Boolean).join(" ") || "Senza nome";
  const statusConfig = STATUS_CONFIG[apt.status as AppointmentStatus];
  const typeConfig = apt.appointment_type ? TYPE_CONFIG[apt.appointment_type as AppointmentType] : null;
  const fullAddress = [apt.address, apt.cap, apt.city].filter(Boolean).join(", ");

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigate("/appointments")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold truncate">{contactName}</h1>
          <p className="text-sm text-muted-foreground">Dettaglio appuntamento</p>
        </div>
        <div className="flex items-center gap-2">
          {statusConfig ? (
            <Badge variant="outline" className={`${statusConfig.className} border`}>
              {statusConfig.label}
            </Badge>
          ) : (
            (() => {
              const m = getStatusMeta(apt.status);
              return (
                <Badge variant="outline" className={m.badgeClass}>
                  {m.label}
                </Badge>
              );
            })()
          )}
          {typeConfig && (
            <Badge variant="outline" className={`${typeConfig.className} border`}>
              {typeConfig.label}
            </Badge>
          )}
          <RiskScoreBadge score={(apt as { risk_score?: number | null }).risk_score} size="md" showLabel />
          <Button
            size="sm"
            variant="default"
            className="ml-1"
            onClick={() => setOutcomeOpen(true)}
          >
            <ClipboardCheck className="h-4 w-4 mr-2" />
            Registra esito
          </Button>
        </div>
      </div>

      {/* Main info */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Data e ora</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow
              icon={Calendar}
              label="Data"
              value={format(parseISO(apt.scheduled_at), "EEEE d MMMM yyyy", { locale: it })}
            />
            <InfoRow
              icon={Clock}
              label="Orario"
              value={`${format(parseISO(apt.scheduled_at), "HH:mm")} · ${apt.duration_minutes} min`}
            />
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Contatto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow icon={User} label="Nome" value={contactName} />
            <InfoRow icon={Phone} label="Telefono" value={apt.contacts?.phone} />
            <InfoRow icon={Mail} label="Email" value={apt.contacts?.email} />
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Luogo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow icon={MapPin} label="Indirizzo" value={fullAddress || "Non specificato"} />
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assegnazione</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoRow
              icon={Briefcase}
              label="Venditore"
              value={apt.assigned_sales_user_id ? "Assegnato" : "Non assegnato"}
            />
            <InfoRow icon={Building2} label="Brand" value={apt.brands?.name} />
          </CardContent>
        </Card>
      </div>

      {/* Notes */}
      {apt.notes && (
        <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Note</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{apt.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Outcome history (append-only) */}
      <Card className="border-border/50 bg-background/60 backdrop-blur-sm">
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Storico esiti
          </CardTitle>
          {apt.last_outcome_at && (
            <span className="text-xs text-muted-foreground">
              Ultimo: {format(parseISO(apt.last_outcome_at), "d MMM yyyy HH:mm", { locale: it })}
            </span>
          )}
        </CardHeader>
        <CardContent>
          {outcomes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nessun esito registrato. Usa "Registra esito" per archiviarne uno.
            </p>
          ) : (
            <ul className="space-y-3">
              {outcomes.map((o) => {
                const m = getOutcomeMeta(o.outcome_code);
                const Icon = m?.icon ?? FileText;
                return (
                  <li
                    key={o.id}
                    className="flex items-start gap-3 rounded-md border border-border/50 bg-background/50 p-3"
                  >
                    <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={m?.badgeClass}>
                          {m?.label ?? o.outcome_code}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(o.created_at), "d MMM yyyy HH:mm", { locale: it })}
                        </span>
                      </div>
                      {o.outcome_notes && (
                        <p className="text-sm mt-1 whitespace-pre-wrap">{o.outcome_notes}</p>
                      )}
                      {o.reschedule_reason && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          <span className="font-medium">Motivo riprog.:</span> {o.reschedule_reason}
                        </p>
                      )}
                      {o.next_action && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          <span className="font-medium">Prossima azione:</span> {o.next_action}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <AppointmentTimeline appointmentId={apt.id} />

      <AppointmentOutcomeDialog
        appointmentId={apt.id}
        open={outcomeOpen}
        onOpenChange={setOutcomeOpen}
        contactName={contactName}
      />
    </div>
  );
}
