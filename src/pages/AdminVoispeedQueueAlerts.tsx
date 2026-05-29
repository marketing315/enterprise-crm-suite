/**
 * F6 Step #7 — Pagina admin "Avvisi code VoiSpeed".
 * Route: /admin/voispeed-queue-alerts
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Bell, AlertCircle, Plus, Trash2, Pencil } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import {
  useVoispeedQueueAlertRules,
  useVoispeedQueueAlertEvents,
  useUpsertVoispeedQueueAlertRule,
  useDeleteVoispeedQueueAlertRule,
  type VoispeedQueueAlertRule,
  type VqarMetric,
  type VqarComparator,
  type VqarSeverity,
} from "@/hooks/useVoispeedQueueAlerts";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

const METRIC_LABEL: Record<VqarMetric, string> = {
  calls_waiting: "Chiamate in attesa",
  longest_wait_seconds: "Attesa massima (s)",
  service_level_pct: "Service Level %",
  abandoned_15m: "Abbandonate (15 min)",
  agents_available: "Agenti disponibili",
};

const SEV_VARIANT: Record<VqarSeverity, "default" | "secondary" | "destructive"> = {
  info: "secondary",
  warning: "default",
  critical: "destructive",
};

interface EditState {
  open: boolean;
  rule: Partial<VoispeedQueueAlertRule> | null;
}

export default function AdminVoispeedQueueAlerts() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id ?? null;

  const rulesQ = useVoispeedQueueAlertRules(brandId);
  const eventsQ = useVoispeedQueueAlertEvents(brandId, 150);
  const upsert = useUpsertVoispeedQueueAlertRule();
  const del = useDeleteVoispeedQueueAlertRule();

  const [edit, setEdit] = useState<EditState>({ open: false, rule: null });

  if (!brandId) {
    return (
      <div className="container mx-auto py-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand per configurare gli avvisi delle code.</AlertDescription>
        </Alert>
      </div>
    );
  }

  function openNew() {
    setEdit({
      open: true,
      rule: {
        brand_id: brandId!,
        name: "",
        queue_name: null,
        metric: "calls_waiting",
        comparator: "gt",
        threshold: 5,
        severity: "warning",
        cooldown_minutes: 15,
        is_active: true,
        notes: "",
      },
    });
  }

  async function save() {
    const r = edit.rule;
    if (!r?.name?.trim() || r.threshold == null || !r.metric) {
      toast.error("Compila almeno nome, metrica e soglia");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: r.id,
        brand_id: brandId!,
        name: r.name.trim(),
        queue_name: r.queue_name?.toString().trim() || null,
        metric: r.metric as VqarMetric,
        comparator: (r.comparator as VqarComparator) ?? "gt",
        threshold: Number(r.threshold),
        severity: (r.severity as VqarSeverity) ?? "warning",
        cooldown_minutes: Number(r.cooldown_minutes ?? 15),
        is_active: r.is_active ?? true,
        notes: r.notes?.trim() || null,
      } as never);
      toast.success(r.id ? "Regola aggiornata" : "Regola creata");
      setEdit({ open: false, rule: null });
    } catch (e) {
      toast.error("Errore: " + (e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!confirm("Eliminare la regola?")) return;
    try {
      await del.mutateAsync({ id, brand_id: brandId! });
      toast.success("Regola eliminata");
    } catch (e) {
      toast.error("Errore: " + (e as Error).message);
    }
  }

  const rules = rulesQ.data ?? [];
  const events = eventsQ.data ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5" /> Avvisi code · VoiSpeed
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brand <strong>{currentBrand?.name}</strong> · soglie SL, attesa, abbandonate · check ogni minuto
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Nuova regola</Button>
      </header>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regole ({rules.length})</TabsTrigger>
          <TabsTrigger value="events">Eventi recenti ({events.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Regole attive</CardTitle>
              <CardDescription>
                Quando la soglia viene superata, parte una notifica in tempo reale ad admin / CEO / responsabili call center del brand.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {rulesQ.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Caricamento…</div>
              ) : rules.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nessuna regola configurata. Crea la prima con "Nuova regola".
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Coda</TableHead>
                      <TableHead>Metrica</TableHead>
                      <TableHead>Soglia</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Cooldown</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell className="text-xs">{r.queue_name ?? <span className="text-muted-foreground">— tutte —</span>}</TableCell>
                        <TableCell className="text-xs">{METRIC_LABEL[r.metric]}</TableCell>
                        <TableCell className="text-xs tabular-nums">{r.comparator === "gt" ? ">" : "<"} {r.threshold}</TableCell>
                        <TableCell><Badge variant={SEV_VARIANT[r.severity]}>{r.severity}</Badge></TableCell>
                        <TableCell className="text-xs tabular-nums">{r.cooldown_minutes}m</TableCell>
                        <TableCell>{r.is_active ? <Badge variant="default">attiva</Badge> : <Badge variant="outline">disattiva</Badge>}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => setEdit({ open: true, rule: r })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => remove(r.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ultimi {events.length} eventi</CardTitle>
              <CardDescription>Append-only · riflesso anche su /admin/observability come <code>voispeed_queue:*</code></CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {events.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">Nessun evento ancora.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Coda</TableHead>
                      <TableHead>Metrica</TableHead>
                      <TableHead>Osservato</TableHead>
                      <TableHead>Soglia</TableHead>
                      <TableHead>Severity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="text-xs tabular-nums">{format(new Date(ev.fired_at), "dd/MM HH:mm:ss", { locale: it })}</TableCell>
                        <TableCell className="text-xs">{ev.queue_name}</TableCell>
                        <TableCell className="text-xs">{METRIC_LABEL[ev.metric]}</TableCell>
                        <TableCell className="text-xs tabular-nums font-medium">{ev.observed_value}</TableCell>
                        <TableCell className="text-xs tabular-nums text-muted-foreground">{ev.comparator === "gt" ? ">" : "<"} {ev.threshold}</TableCell>
                        <TableCell><Badge variant={SEV_VARIANT[ev.severity]}>{ev.severity}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={edit.open} onOpenChange={(o) => setEdit({ open: o, rule: o ? edit.rule : null })}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit.rule?.id ? "Modifica regola" : "Nuova regola"}</DialogTitle>
          </DialogHeader>
          {edit.rule && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={edit.rule.name ?? ""} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, name: e.target.value } })} placeholder="es. SLA Coda Vendite < 80%" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Coda (lascia vuoto = tutte)</Label>
                  <Input value={edit.rule.queue_name ?? ""} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, queue_name: e.target.value || null } })} placeholder="es. vendite" />
                </div>
                <div className="space-y-1.5">
                  <Label>Severity</Label>
                  <Select value={edit.rule.severity ?? "warning"} onValueChange={(v) => setEdit({ ...edit, rule: { ...edit.rule, severity: v as VqarSeverity } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">info</SelectItem>
                      <SelectItem value="warning">warning</SelectItem>
                      <SelectItem value="critical">critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Metrica</Label>
                  <Select value={edit.rule.metric ?? "calls_waiting"} onValueChange={(v) => setEdit({ ...edit, rule: { ...edit.rule, metric: v as VqarMetric } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(METRIC_LABEL) as VqarMetric[]).map((m) => (
                        <SelectItem key={m} value={m}>{METRIC_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Confronto</Label>
                  <Select value={edit.rule.comparator ?? "gt"} onValueChange={(v) => setEdit({ ...edit, rule: { ...edit.rule, comparator: v as VqarComparator } })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gt">&gt; maggiore</SelectItem>
                      <SelectItem value="lt">&lt; minore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Soglia</Label>
                  <Input type="number" step="0.01" value={edit.rule.threshold ?? 0} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, threshold: Number(e.target.value) } })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Cooldown (min)</Label>
                  <Input type="number" min={1} max={1440} value={edit.rule.cooldown_minutes ?? 15} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, cooldown_minutes: Number(e.target.value) } })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Regola attiva</Label>
                <Switch checked={edit.rule.is_active ?? true} onCheckedChange={(v) => setEdit({ ...edit, rule: { ...edit.rule, is_active: v } })} />
              </div>
              <div className="space-y-1.5">
                <Label>Note (opzionale)</Label>
                <Textarea rows={2} value={edit.rule.notes ?? ""} onChange={(e) => setEdit({ ...edit, rule: { ...edit.rule, notes: e.target.value } })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit({ open: false, rule: null })}>Annulla</Button>
            <Button onClick={save} disabled={upsert.isPending}>{upsert.isPending ? "Salvataggio…" : "Salva"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
