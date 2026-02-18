import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Send, Plus, X, Clock, Mail, AlertTriangle, Users, CalendarIcon, CalendarRange } from "lucide-react";
import { format, isAfter, isBefore, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  useLeadDigestConfig,
  useUpdateLeadDigestConfig,
  useManualLeadDigestDispatch,
  type LeadDigestConfig,
} from "@/hooks/useLeadDigest";

// ── Sub-components ─────────────────────────────────────────────────────────

function EmailListInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const email = draft.trim().toLowerCase();
    if (!email || value.includes(email)) return;
    onChange([...value, email]);
    setDraft("");
  };

  const remove = (email: string) => onChange(value.filter((e) => e !== email));

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder={placeholder || "email@example.com"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="flex-1"
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((email) => (
          <Badge key={email} variant="secondary" className="gap-1 pr-1">
            {email}
            <button onClick={() => remove(email)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ScheduleTimesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const t = draft.trim();
    if (!t || value.includes(t)) return;
    onChange([...value, t].sort());
    setDraft("");
  };

  const remove = (t: string) => onChange(value.filter((v) => v !== t));

  return (
    <div className="space-y-2">
      <Label>Orari di invio (HH:mm, Europe/Rome)</Label>
      <div className="flex gap-2">
        <Input
          type="time"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          className="w-40"
        />
        <Button type="button" variant="outline" size="icon" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {value.map((t) => (
          <Badge key={t} variant="outline" className="gap-1 pr-1 font-mono">
            <Clock className="h-3 w-3" />
            {t}
            <button onClick={() => remove(t)} className="hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
    </div>
  );
}

function DateTimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Date | undefined;
  onChange: (d: Date) => void;
}) {
  const [timeStr, setTimeStr] = useState(() =>
    value ? format(value, "HH:mm") : "00:00"
  );

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) return;
    const [h, m] = timeStr.split(":").map(Number);
    const combined = new Date(day);
    combined.setHours(h, m, 0, 0);
    onChange(combined);
  };

  const handleTimeChange = (t: string) => {
    setTimeStr(t);
    if (value) {
      const [h, m] = t.split(":").map(Number);
      const combined = new Date(value);
      combined.setHours(h, m, 0, 0);
      onChange(combined);
    }
  };

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn("w-40 justify-start text-left font-normal", !value && "text-muted-foreground")}
            >
              <CalendarIcon className="h-4 w-4 mr-2 flex-shrink-0" />
              {value ? format(value, "dd/MM/yyyy", { locale: it }) : "Seleziona data"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value}
              onSelect={handleDaySelect}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Input
          type="time"
          value={timeStr}
          onChange={(e) => handleTimeChange(e.target.value)}
          className="w-28"
        />
        {value && (
          <span className="text-xs text-muted-foreground">
            {format(value, "dd/MM HH:mm", { locale: it })} (Europe/Rome)
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function LeadDigestSettings() {
  const { data: config, isLoading } = useLeadDigestConfig();
  const updateMutation = useUpdateLeadDigestConfig();
  const dispatchMutation = useManualLeadDigestDispatch();

  const [form, setForm] = useState<Partial<LeadDigestConfig>>({});
  const isDirty = Object.keys(form).length > 0;
  const current = { ...config, ...form } as LeadDigestConfig;

  // Custom period state
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const customError = (() => {
    if (!customFrom || !customTo) return null;
    if (!isBefore(customFrom, customTo)) return "La data 'Da' deve essere precedente alla data 'A'";
    if (differenceInDays(customTo, customFrom) > 31) return "Il range massimo consentito è 31 giorni";
    return null;
  })();

  const canSendCustom =
    (current.to_recipients ?? []).length > 0 &&
    customFrom !== undefined &&
    customTo !== undefined &&
    customError === null;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(form);
      setForm({});
      toast.success("Configurazione salvata");
    } catch {
      toast.error("Errore nel salvataggio");
    }
  };

  const handleSendNow = async () => {
    try {
      const result = await dispatchMutation.mutateAsync({ mode: "manual" });
      toast.success(
        result.success
          ? `Digest inviato — ${result.counts?.unique ?? 0} lead unici`
          : "Invio fallito"
      );
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore nell'invio");
    }
  };

  const handleSendCustom = async () => {
    if (!customFrom || !customTo) return;
    try {
      const result = await dispatchMutation.mutateAsync({
        mode: "manual_custom",
        force_window_start: customFrom.toISOString(),
        force_window_end: customTo.toISOString(),
      });
      toast.success(
        result.success
          ? `Digest custom inviato — ${result.counts?.unique ?? 0} lead unici`
          : "Invio fallito"
      );
    } catch (e: unknown) {
      toast.error((e as Error).message || "Errore nell'invio");
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Lead Digest Call Center
            </CardTitle>
            <CardDescription>
              Riepilogo automatico nuovi lead verso il call center
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={current.is_enabled ? "default" : "secondary"}>
              {current.is_enabled ? "Attivo" : "Disattivato"}
            </Badge>
            <Switch
              checked={current.is_enabled ?? false}
              onCheckedChange={(v) => setForm((f) => ({ ...f, is_enabled: v }))}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Warning: TO vuoto */}
        {(current.to_recipients ?? []).length === 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Nessun destinatario TO configurato. Il digest non verrà inviato finché non aggiungi almeno un indirizzo email.
            </AlertDescription>
          </Alert>
        )}

        {/* Preview destinatari */}
        {(current.to_recipients ?? []).length > 0 && (
          <div className="flex items-start gap-2 text-sm bg-muted/40 rounded-md p-3">
            <Users className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
            <div>
              <span className="font-medium">Invierà a: </span>
              <span>{current.to_recipients?.join(", ")}</span>
              {(current.cc_recipients ?? []).length > 0 && (
                <span className="text-muted-foreground"> (CC: {current.cc_recipients?.join(", ")})</span>
              )}
            </div>
          </div>
        )}

        {/* Schedule times */}
        <ScheduleTimesInput
          value={current.schedule_times ?? ["12:00", "16:30"]}
          onChange={(v) => setForm((f) => ({ ...f, schedule_times: v }))}
        />

        <Separator />

        {/* Recipients */}
        <EmailListInput
          label="Destinatari (TO) *"
          value={current.to_recipients ?? []}
          onChange={(v) => setForm((f) => ({ ...f, to_recipients: v }))}
          placeholder="callcenter@azienda.it"
        />

        <EmailListInput
          label="Destinatari (CC)"
          value={current.cc_recipients ?? []}
          onChange={(v) => setForm((f) => ({ ...f, cc_recipients: v }))}
          placeholder="manager@azienda.it"
        />

        <Separator />

        {/* Options */}
        <div className="flex items-center justify-between">
          <div>
            <Label>Includi link filtrato lead</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aggiunge un link diretto alla lista lead filtrata per finestra temporale
            </p>
          </div>
          <Switch
            checked={current.include_filtered_link ?? false}
            onCheckedChange={(v) => setForm((f) => ({ ...f, include_filtered_link: v }))}
          />
        </div>

        <Separator />

        {/* Webhook URL override */}
        <div className="space-y-1.5">
          <Label>Webhook URL override (opzionale)</Label>
          <Input
            placeholder="https://n8n.azienda.it/webhook/... (lascia vuoto per usare env)"
            value={current.webhook_url_override ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                webhook_url_override: e.target.value || null,
              }))
            }
          />
          <p className="text-xs text-muted-foreground">
            Se vuoto, usa N8N_LEAD_DIGEST_WEBHOOK_URL configurato nelle variabili d'ambiente
          </p>
        </div>

        <Separator />

        {/* ── Actions ── */}
        <div className="space-y-4">
          {/* Save / cancel */}
          {isDirty && (
            <div className="flex items-center gap-3 flex-wrap">
              <Button onClick={handleSave} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
              </Button>
              <Button variant="ghost" onClick={() => setForm({})}>
                Annulla
              </Button>
            </div>
          )}

          {/* Invio rapido */}
          <div className="rounded-md border p-4 space-y-2">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Send className="h-4 w-4" />
              Invio rapido
            </p>
            <p className="text-xs text-muted-foreground">
              Invia i lead dall'ultimo digest riuscito fino ad adesso.
            </p>
            <Button
              variant="outline"
              onClick={handleSendNow}
              disabled={dispatchMutation.isPending || (current.to_recipients ?? []).length === 0}
              title={(current.to_recipients ?? []).length === 0 ? "Aggiungi almeno un destinatario TO" : undefined}
            >
              <Send className="h-4 w-4 mr-2" />
              {dispatchMutation.isPending ? "Invio..." : "Invia ora"}
            </Button>
          </div>

          {/* Invio periodo custom */}
          <div className="rounded-md border p-4 space-y-4">
            <div>
              <p className="text-sm font-medium flex items-center gap-1.5">
                <CalendarRange className="h-4 w-4" />
                Invio per periodo personalizzato
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Seleziona un range di date per inviare il digest con i lead di quel periodo.
                Fuso orario: Europe/Rome — range massimo 31 giorni.
              </p>
            </div>

            <DateTimePicker
              label="Da"
              value={customFrom}
              onChange={setCustomFrom}
            />
            <DateTimePicker
              label="A"
              value={customTo}
              onChange={setCustomTo}
            />

            {customError && (
              <Alert variant="destructive" className="py-2">
                <AlertTriangle className="h-3.5 w-3.5" />
                <AlertDescription className="text-xs">{customError}</AlertDescription>
              </Alert>
            )}

            {customFrom && customTo && !customError && (
              <p className="text-xs text-muted-foreground">
                Periodo selezionato: <strong>{format(customFrom, "dd/MM/yyyy HH:mm", { locale: it })}</strong>
                {" → "}
                <strong>{format(customTo, "dd/MM/yyyy HH:mm", { locale: it })}</strong>
                {" "}({differenceInDays(customTo, customFrom)} giorni)
              </p>
            )}

            <Button
              variant="outline"
              onClick={handleSendCustom}
              disabled={!canSendCustom || dispatchMutation.isPending}
              title={
                (current.to_recipients ?? []).length === 0
                  ? "Aggiungi almeno un destinatario TO"
                  : !customFrom || !customTo
                  ? "Seleziona da e a"
                  : customError || undefined
              }
            >
              <CalendarRange className="h-4 w-4 mr-2" />
              {dispatchMutation.isPending ? "Invio..." : "Invia periodo custom"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
