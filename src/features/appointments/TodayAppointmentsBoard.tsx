/**
 * TodayAppointmentsBoard — top-of-dashboard agenda for the logged-in
 * salesperson with quick outcome actions per row.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { CalendarDays, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RiskScoreBadge } from "./RiskScoreBadge";
import { getStatusMeta, getOutcomeMeta } from "./taxonomy";
import { useTodayAppointments, type TodayAppointment } from "./useTodayAppointments";
import { SkippedAppointmentDialog } from "./SkippedAppointmentDialog";
import { AppointmentDoneFlow } from "./AppointmentDoneFlow";

export function TodayAppointmentsBoard() {
  const navigate = useNavigate();
  const { data: appts = [], isLoading } = useTodayAppointments();
  const [skipFor, setSkipFor] = useState<TodayAppointment | null>(null);
  const [doneFor, setDoneFor] = useState<TodayAppointment | null>(null);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-5 w-5 text-primary" />
              Agenda di oggi
            </CardTitle>
            <CardDescription>
              {isLoading ? "…" : `${appts.length} appuntament${appts.length === 1 ? "o" : "i"}`}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : appts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            Nessun appuntamento per oggi
          </p>
        ) : (
          <div className="space-y-2">
            {appts.map((appt) => {
              const statusMeta = getStatusMeta(appt.status);
              const StatusIcon = statusMeta.icon;
              const outcomeMeta = getOutcomeMeta(appt.last_outcome_code);
              const isClosed = statusMeta.isTerminal || !!appt.last_outcome_code;
              const contactName =
                `${appt.contact?.first_name ?? ""} ${appt.contact?.last_name ?? ""}`.trim() ||
                "Senza nome";
              return (
                <div
                  key={appt.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 hover:bg-muted/60 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex flex-col items-center justify-center w-12 shrink-0 text-center">
                      <span className="text-[10px] uppercase text-muted-foreground font-medium">
                        {format(new Date(appt.scheduled_at), "EEE", { locale: it })}
                      </span>
                      <span className="text-lg font-semibold leading-none">
                        {format(new Date(appt.scheduled_at), "HH:mm")}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{contactName}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {appt.city || appt.address || "—"}
                      </p>
                    </div>
                    <RiskScoreBadge score={appt.risk_score} size="sm" />
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {isClosed ? (
                      <>
                        <Badge variant="outline" className={`text-xs gap-1 ${statusMeta.badgeClass}`}>
                          <StatusIcon className="h-3 w-3" />
                          {outcomeMeta?.label ?? statusMeta.shortLabel}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/appointments/${appt.id}`)}
                        >
                          Dettaglio
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => setSkipFor(appt)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Saltato
                        </Button>
                        <Button size="sm" onClick={() => setDoneFor(appt)}>
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Fatto
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {skipFor && (
        <SkippedAppointmentDialog
          appointmentId={skipFor.id}
          open={!!skipFor}
          onOpenChange={(o) => !o && setSkipFor(null)}
          contactName={
            `${skipFor.contact?.first_name ?? ""} ${skipFor.contact?.last_name ?? ""}`.trim()
          }
        />
      )}
      {doneFor && (
        <AppointmentDoneFlow
          appointment={doneFor}
          open={!!doneFor}
          onOpenChange={(o) => !o && setDoneFor(null)}
        />
      )}
    </Card>
  );
}
