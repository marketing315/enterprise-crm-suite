import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Mail, Power, Send, Loader2 } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useTeamMembers } from "@/hooks/useTeam";
import {
  useSalesRouteSchedule,
  useUpsertSalesRouteSchedule,
  dispatchRouteNow,
} from "@/hooks/useSalesRoute";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const DAYS = [
  { v: 1, l: "Lun" }, { v: 2, l: "Mar" }, { v: 3, l: "Mer" },
  { v: 4, l: "Gio" }, { v: 5, l: "Ven" }, { v: 6, l: "Sab" }, { v: 7, l: "Dom" },
];

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function SettingsSalesRoute() {
  const navigate = useNavigate();
  const { currentBrand } = useBrand();
  const { data: schedule, isLoading } = useSalesRouteSchedule();
  const upsert = useUpsertSalesRouteSchedule();
  const { data: team } = useTeamMembers();

  const [isActive, setIsActive] = useState(false);
  const [days, setDays] = useState<number[]>([1,2,3,4,5]);
  const [time, setTime] = useState("20:00");
  const [sendAggregate, setSendAggregate] = useState(true);
  const [aggregateUserIds, setAggregateUserIds] = useState<string[]>([]);
  const [extraEmail, setExtraEmail] = useState("");
  const [extraEmails, setExtraEmails] = useState<string[]>([]);
  const [sendingNow, setSendingNow] = useState(false);

  useEffect(() => {
    if (schedule) {
      setIsActive(!!schedule.is_active);
      setDays(schedule.days_of_week || [1,2,3,4,5]);
      setTime(String(schedule.send_at_local).slice(0, 5));
      setSendAggregate(schedule.send_aggregate !== false);
      setAggregateUserIds(schedule.aggregate_recipient_user_ids || []);
      setExtraEmails(schedule.aggregate_extra_emails || []);
    }
  }, [schedule]);

  const teamOptions = useMemo(() => {
    return (team || []).filter((m: any) => m.email).map((m: any) => ({
      id: m.id, full_name: m.full_name || m.email, email: m.email,
    }));
  }, [team]);

  const save = async (overrides?: Partial<{
    is_active: boolean; days_of_week: number[]; send_at_local: string;
    send_aggregate: boolean; aggregate_recipient_user_ids: string[]; aggregate_extra_emails: string[];
  }>) => {
    if (!currentBrand?.id) return;
    try {
      await upsert.mutateAsync({
        brand_id: currentBrand.id,
        is_active: overrides?.is_active ?? isActive,
        days_of_week: overrides?.days_of_week ?? days,
        send_at_local: overrides?.send_at_local ?? time,
        timezone: "Europe/Rome",
        recipients_mode: "with_appointments",
        send_aggregate: overrides?.send_aggregate ?? sendAggregate,
        aggregate_recipient_user_ids: overrides?.aggregate_recipient_user_ids ?? aggregateUserIds,
        aggregate_extra_emails: overrides?.aggregate_extra_emails ?? extraEmails,
      } as any);
    } catch (e) {
      toast.error("Salvataggio fallito", {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const toggleDay = (d: number) => {
    const next = days.includes(d) ? days.filter(x => x !== d) : [...days, d].sort();
    setDays(next);
    save({ days_of_week: next });
  };

  const addExtraEmail = () => {
    const v = extraEmail.trim().toLowerCase();
    if (!v || extraEmails.includes(v)) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) {
      toast.error("Email non valida");
      return;
    }
    const next = [...extraEmails, v];
    setExtraEmails(next);
    setExtraEmail("");
    save({ aggregate_extra_emails: next });
  };
  const removeExtraEmail = (e: string) => {
    const next = extraEmails.filter(x => x !== e);
    setExtraEmails(next);
    save({ aggregate_extra_emails: next });
  };

  const toggleAggregateUser = (uid: string) => {
    const next = aggregateUserIds.includes(uid)
      ? aggregateUserIds.filter(x => x !== uid)
      : [...aggregateUserIds, uid];
    setAggregateUserIds(next);
    save({ aggregate_recipient_user_ids: next });
  };

  const sendTomorrow = async () => {
    if (!currentBrand?.id) return;
    setSendingNow(true);
    try {
      const res = await dispatchRouteNow({
        brandId: currentBrand.id,
        routeDate: tomorrowIso(),
        audience: "both",
      });
      const r = res?.results?.[0];
      toast.success("Invio completato", {
        description: r ? `Individuali: ${r.individual_sent} · Aggregati: ${r.aggregate_sent}` : "OK",
      });
    } catch (e) {
      toast.error("Invio fallito", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSendingNow(false);
    }
  };

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
          <Mail className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Giro venditori</h1>
          <p className="text-sm text-muted-foreground">
            Email automatica con l'agenda del giorno successivo
          </p>
        </div>
      </div>

      {/* Activation */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Power className={cn("h-5 w-5", isActive ? "text-primary" : "text-muted-foreground")} />
            <div>
              <div className="font-medium">Invio automatico</div>
              <div className="text-xs text-muted-foreground">
                {isActive ? "Attivo" : "Disattivato"}
                {schedule?.last_run_at && (
                  <> · ultimo run {new Date(schedule.last_run_at).toLocaleString("it-IT")}</>
                )}
              </div>
            </div>
          </div>
          <Switch
            checked={isActive}
            onCheckedChange={(v) => { setIsActive(v); save({ is_active: v }); }}
          />
        </div>
      </div>

      {/* Days + time */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div>
          <Label className="text-sm font-medium">Giorni di invio</Label>
          <p className="text-xs text-muted-foreground mt-0.5">L'email viene inviata con l'agenda del <strong>giorno successivo</strong>.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {DAYS.map(d => (
              <button
                key={d.v}
                onClick={() => toggleDay(d.v)}
                className={cn(
                  "h-9 w-12 rounded-lg border text-sm font-medium transition",
                  days.includes(d.v)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40"
                )}
              >{d.l}</button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="time" className="text-sm font-medium">Orario invio (Europe/Rome)</Label>
            <Input
              id="time" type="time" value={time}
              onChange={(e) => setTime(e.target.value)}
              onBlur={() => save({ send_at_local: time })}
              className="mt-2"
            />
          </div>
        </div>
      </div>

      {/* Aggregate recipients */}
      <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium">Email aggregata a manager / CEO</div>
            <p className="text-xs text-muted-foreground">Riepilogo di tutti i venditori del giorno</p>
          </div>
          <Switch
            checked={sendAggregate}
            onCheckedChange={(v) => { setSendAggregate(v); save({ send_aggregate: v }); }}
          />
        </div>

        {sendAggregate && (
          <>
            <div>
              <Label className="text-sm font-medium">Membri del team</Label>
              <div className="mt-2 max-h-48 overflow-auto rounded-lg border divide-y">
                {teamOptions.length === 0 && (
                  <div className="p-3 text-sm text-muted-foreground">Nessun utente nel team</div>
                )}
                {teamOptions.map((m: any) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 p-3 text-sm hover:bg-accent">
                    <input
                      type="checkbox"
                      checked={aggregateUserIds.includes(m.id)}
                      onChange={() => toggleAggregateUser(m.id)}
                      className="h-4 w-4 rounded border-border"
                    />
                    <span className="flex-1">{m.full_name}</span>
                    <span className="text-xs text-muted-foreground">{m.email}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium">Email esterne aggiuntive</Label>
              <div className="mt-2 flex gap-2">
                <Input
                  value={extraEmail}
                  onChange={(e) => setExtraEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addExtraEmail(); } }}
                  placeholder="ceo@azienda.it"
                />
                <Button variant="outline" onClick={addExtraEmail}>Aggiungi</Button>
              </div>
              {extraEmails.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {extraEmails.map(e => (
                    <Badge key={e} variant="secondary" className="cursor-pointer" onClick={() => removeExtraEmail(e)}>
                      {e} ✕
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Test send */}
      <div className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="font-medium">Invio di prova</div>
              <div className="text-xs text-muted-foreground">Invia subito il giro di domani a tutti i destinatari configurati</div>
            </div>
          </div>
          <Button onClick={sendTomorrow} disabled={sendingNow}>
            {sendingNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Invia ora
          </Button>
        </div>
      </div>
    </div>
  );
}
