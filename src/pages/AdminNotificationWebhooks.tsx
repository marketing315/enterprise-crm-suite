import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
  DialogDescription} from "@/components/ui/dialog";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";
import { Webhook, Plus, AlertCircle, CheckCircle2, Activity } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { WebhookHealthDashboard } from "@/components/admin/WebhookHealthDashboard";

const DEFAULT_TYPES = [
  "ticket_escalated",
  "ai_action_proposed",
  "slo_alert",
  "high_risk_appointment",
  "deal_stage_changed",
] as const;

interface Destination {
  id: string;
  brand_id: string;
  name: string;
  endpoint_url: string;
  preset: string;
  notification_types: string[];
  is_active: boolean;
  retry_max: number;
  consecutive_failures: number;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface OutboxRow {
  id: string;
  destination_id: string;
  notification_type: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  delivered_at: string | null;
}

export default function AdminNotificationWebhooks() {
  const { currentBrand } = useBrand();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    endpoint_url: "",
    hmac_secret: "",
    preset: "generic",
    notification_types: [] as string[],
  });

  const brandId = currentBrand?.id ?? null;

  const { data: destinations = [], isLoading } = useQuery({
    queryKey: ["notification-webhook-destinations", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_webhook_destinations")
        .select("id, brand_id, name, endpoint_url, preset, notification_types, is_active, created_at, updated_at")
        .eq("brand_id", brandId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Destination[];
    },
  });

  const { data: outbox = [] } = useQuery({
    queryKey: ["notification-webhook-outbox", brandId],
    enabled: !!brandId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_webhook_outbox")
        .select("id, destination_id, notification_type, status, attempts, last_error, created_at, delivered_at")
        .eq("brand_id", brandId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as OutboxRow[];
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      if (!brandId) throw new Error("Brand mancante");
      if (!form.name.trim() || !form.endpoint_url.trim() || !form.hmac_secret.trim()) {
        throw new Error("Nome, endpoint e HMAC secret sono obbligatori");
      }
      const { error } = await (supabase as any)
        .from("notification_webhook_destinations")
        .insert({
          brand_id: brandId,
          name: form.name.trim(),
          endpoint_url: form.endpoint_url.trim(),
          hmac_secret: form.hmac_secret.trim(),
          preset: form.preset,
          notification_types: form.notification_types,
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Destinazione webhook creata");
      setOpen(false);
      setForm({ name: "", endpoint_url: "", hmac_secret: "", preset: "generic", notification_types: [] });
      qc.invalidateQueries({ queryKey: ["notification-webhook-destinations"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any)
        .from("notification_webhook_destinations")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notification-webhook-destinations"] }),
  });

  const toggleType = (t: string) => {
    setForm((f) => ({
      ...f,
      notification_types: f.notification_types.includes(t)
        ? f.notification_types.filter((x) => x !== t)
        : [...f.notification_types, t],
    }));
  };

  const statusColor = (s: string) =>
    s === "sent" ? "default" : s === "dead_letter" ? "destructive" : s === "failed" ? "destructive" : "secondary";

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Webhook className="h-7 w-7 text-primary" />
            Webhook notifiche
          </h1>
          <p className="text-muted-foreground mt-1">
            Inoltra escalation ticket, override AI e alert SLO verso Google Sheets, n8n o sistemi esterni.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" /> Nuova destinazione</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuova destinazione webhook</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="es. Sheet escalation Q1" />
              </div>
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input value={form.endpoint_url} onChange={(e) => setForm({ ...form, endpoint_url: e.target.value })} placeholder="https://script.google.com/macros/s/.../exec" />
              </div>
              <div className="space-y-2">
                <Label>HMAC secret</Label>
                <Textarea rows={2} value={form.hmac_secret} onChange={(e) => setForm({ ...form, hmac_secret: e.target.value })} placeholder="Genera una stringa casuale ≥32 char" />
                <p className="text-xs text-muted-foreground">
                  Firma SHA-256 inviata in <code>X-Lovable-Signature</code>. Verifica lato ricevitore.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Preset</Label>
                <Select value={form.preset} onValueChange={(v) => setForm({ ...form, preset: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="generic">Generic JSON</SelectItem>
                    <SelectItem value="google_sheets">Google Sheets (Apps Script)</SelectItem>
                    <SelectItem value="n8n">n8n</SelectItem>
                    <SelectItem value="slack_compatible">Slack-compatible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipi di notifica (vuoto = tutti)</Label>
                <div className="flex flex-wrap gap-2">
                  {DEFAULT_TYPES.map((t) => (
                    <Badge
                      key={t}
                      variant={form.notification_types.includes(t) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => toggleType(t)}
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button>
              <Button onClick={() => createMut.mutate()} disabled={createMut.isPending}>
                {createMut.isPending ? "Creazione…" : "Crea"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="health">
        <TabsList>
          <TabsTrigger value="health" className="gap-1.5">
            <Activity className="h-4 w-4" /> Health
          </TabsTrigger>
          <TabsTrigger value="destinations">Destinazioni</TabsTrigger>
          <TabsTrigger value="outbox">Coda di consegna</TabsTrigger>
        </TabsList>

        <TabsContent value="health">
          <WebhookHealthDashboard />
        </TabsContent>

        <TabsContent value="destinations" className="space-y-3">
          {isLoading && <p className="text-muted-foreground">Caricamento…</p>}
          {!isLoading && destinations.length === 0 && (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Nessuna destinazione configurata.
            </CardContent></Card>
          )}
          {destinations.map((d) => (
            <Card key={d.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {d.name}
                      <Badge variant="outline" className="text-xs">{d.preset}</Badge>
                      {d.consecutive_failures > 0 && (
                        <Badge variant="destructive" className="text-xs flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" /> {d.consecutive_failures} fallimenti
                        </Badge>
                      )}
                      {d.last_success_at && d.consecutive_failures === 0 && (
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> attivo
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="truncate max-w-xl mt-1">{d.endpoint_url}</CardDescription>
                  </div>
                  <Switch
                    checked={d.is_active}
                    onCheckedChange={(v) => toggleMut.mutate({ id: d.id, is_active: v })}
                  />
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="flex flex-wrap gap-1">
                  {d.notification_types.length === 0
                    ? <Badge variant="outline" className="text-xs">tutti i tipi</Badge>
                    : d.notification_types.map((t) => <Badge key={t} variant="outline" className="text-xs">{t}</Badge>)}
                </div>
                {d.last_error && (
                  <p className="text-xs text-destructive">Ultimo errore: {d.last_error}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="outbox" className="space-y-2">
          {outbox.length === 0 && (
            <Card><CardContent className="py-8 text-center text-muted-foreground">
              Nessuna consegna registrata.
            </CardContent></Card>
          )}
          {outbox.map((o) => (
            <Card key={o.id}>
              <CardContent className="py-3 flex items-center justify-between gap-4 text-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant={statusColor(o.status) as any} className="text-xs">{o.status}</Badge>
                  <span className="font-mono text-xs">{o.notification_type}</span>
                  <span className="text-muted-foreground text-xs truncate">
                    {format(new Date(o.created_at), "dd MMM HH:mm", { locale: it })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>tentativi: {o.attempts}</span>
                  {o.last_error && <span className="text-destructive truncate max-w-xs">{o.last_error}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
