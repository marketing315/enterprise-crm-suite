import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Send, Plus, X, Clock, Mail, RotateCcw } from "lucide-react";
import {
  useLeadDigestConfig,
  useUpdateLeadDigestConfig,
  useManualLeadDigestDispatch,
  type LeadDigestConfig,
} from "@/hooks/useLeadDigest";

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

export function LeadDigestSettings() {
  const { data: config, isLoading } = useLeadDigestConfig();
  const updateMutation = useUpdateLeadDigestConfig();
  const dispatchMutation = useManualLeadDigestDispatch();

  const [form, setForm] = useState<Partial<LeadDigestConfig>>({});
  const isDirty = Object.keys(form).length > 0;

  const current = { ...config, ...form } as LeadDigestConfig;

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync(form);
      setForm({});
      toast.success("Configurazione salvata");
    } catch (e) {
      toast.error("Errore nel salvataggio");
    }
  };

  const handleSendNow = async () => {
    try {
      const result = await dispatchMutation.mutateAsync();
      toast.success(
        result.success
          ? `Digest inviato — ${result.counts?.unique ?? 0} lead unici`
          : "Invio fallito"
      );
    } catch (e: any) {
      toast.error(e.message || "Errore nell'invio");
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
        {/* Schedule times */}
        <ScheduleTimesInput
          value={current.schedule_times ?? ["12:00", "16:30"]}
          onChange={(v) => setForm((f) => ({ ...f, schedule_times: v }))}
        />

        <Separator />

        {/* Recipients */}
        <EmailListInput
          label="Destinatari (TO)"
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

        {/* Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {isDirty && (
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Salvataggio..." : "Salva modifiche"}
            </Button>
          )}
          {isDirty && (
            <Button variant="ghost" onClick={() => setForm({})}>
              Annulla
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleSendNow}
            disabled={dispatchMutation.isPending}
            className="ml-auto"
          >
            <Send className="h-4 w-4 mr-2" />
            {dispatchMutation.isPending ? "Invio..." : "Invia ora"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
