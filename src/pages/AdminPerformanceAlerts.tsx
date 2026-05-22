/**
 * F5.5 — Admin: Performance Alerts
 * Gestione regole soglie + storico eventi recenti.
 */
import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Plus, Trash2, AlertTriangle, Check, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useBrand } from "@/contexts/BrandContext";
import {
  AlertComparator, AlertMetric, AlertSeverity, METRIC_HINT, METRIC_LABEL,
  PerformanceAlertRule, useAcknowledgeAlertEvent, useDeleteAlertRule,
  usePerformanceAlertEvents, usePerformanceAlertRules, useUpsertAlertRule,
} from "@/hooks/usePerformanceAlerts";

function severityVariant(s: AlertSeverity): "default" | "secondary" | "destructive" {
  if (s === "critical") return "destructive";
  if (s === "warning") return "default";
  return "secondary";
}

function formatValue(metric: AlertMetric, v: number): string {
  if (metric === "cpl") return `€${v.toFixed(2)}`;
  return `${v.toFixed(1)}%`;
}

function RuleDialog({
  open, onOpenChange, initial,
}: { open: boolean; onOpenChange: (v: boolean) => void; initial?: PerformanceAlertRule }) {
  const upsert = useUpsertAlertRule();
  const [name, setName] = useState(initial?.name ?? "");
  const [metric, setMetric] = useState<AlertMetric>(initial?.metric ?? "cpl");
  const [comparator, setComparator] = useState<AlertComparator>(initial?.comparator ?? "gt");
  const [threshold, setThreshold] = useState(String(initial?.threshold ?? "50"));
  const [windowDays, setWindowDays] = useState(String(initial?.window_days ?? 7));
  const [severity, setSeverity] = useState<AlertSeverity>(initial?.severity ?? "warning");
  const [cooldown, setCooldown] = useState(String(initial?.cooldown_minutes ?? 60));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const save = async () => {
    if (!name.trim()) { toast.error("Nome obbligatorio"); return; }
    const t = Number(threshold);
    if (!Number.isFinite(t)) { toast.error("Soglia non valida"); return; }
    try {
      await upsert.mutateAsync({
        id: initial?.id,
        name: name.trim(),
        metric, comparator, threshold: t,
        window_days: Math.max(1, Math.min(90, Number(windowDays) || 7)),
        cooldown_minutes: Math.max(5, Math.min(1440, Number(cooldown) || 60)),
        severity, is_active: isActive, notes: notes || null,
        source_filter: initial?.source_filter ?? {},
      });
      toast.success(initial ? "Regola aggiornata" : "Regola creata");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore salvataggio");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Modifica regola" : "Nuova regola alert"}</DialogTitle>
          <DialogDescription>Configura una soglia di performance da monitorare.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Es. CPL Meta troppo alto" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Metrica</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as AlertMetric)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(METRIC_LABEL) as AlertMetric[]).map((m) => (
                    <SelectItem key={m} value={m}>{METRIC_LABEL[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{METRIC_HINT[metric]}</p>
            </div>
            <div className="grid gap-2">
              <Label>Comparatore</Label>
              <Select value={comparator} onValueChange={(v) => setComparator(v as AlertComparator)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gt">&gt; maggiore di</SelectItem>
                  <SelectItem value="lt">&lt; minore di</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label>Soglia</Label>
              <Input type="number" step="0.1" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Finestra (giorni)</Label>
              <Input type="number" min={1} max={90} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label>Cooldown (min)</Label>
              <Input type="number" min={5} max={1440} value={cooldown} onChange={(e) => setCooldown(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Severità</Label>
              <Select value={severity} onValueChange={(v) => setSeverity(v as AlertSeverity)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3 pt-6">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Attiva</Label>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>Note</Label>
            <Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={save} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvataggio…" : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminPerformanceAlerts() {
  const { currentBrand } = useBrand();
  const rules = usePerformanceAlertRules();
  const events = usePerformanceAlertEvents(100);
  const del = useDeleteAlertRule();
  const ack = useAcknowledgeAlertEvent();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PerformanceAlertRule | undefined>();

  const openNew = () => { setEditing(undefined); setDialogOpen(true); };
  const openEdit = (r: PerformanceAlertRule) => { setEditing(r); setDialogOpen(true); };

  if (!currentBrand) {
    return (
      <div className="container py-12 text-center text-muted-foreground">
        Seleziona un brand per gestire gli alert.
      </div>
    );
  }

  const unack = events.data?.filter((e) => !e.acknowledged_at).length ?? 0;

  return (
    <div className="container py-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <BellRing className="h-6 w-6 text-primary" />
            Alert performance
          </h1>
          <p className="text-sm text-muted-foreground">
            CPL, risposta chiamate, consegne, sentiment — valutati ogni 30 min.
          </p>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" />Nuova regola</Button>
      </header>

      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Regole ({rules.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="events">
            Eventi recenti {unack > 0 && <Badge variant="destructive" className="ml-2">{unack} nuovi</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rules" className="space-y-3">
          {rules.isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Caricamento…</p>
          ) : rules.data?.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Nessuna regola. Crea la prima per iniziare a monitorare le performance.
            </CardContent></Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Metrica</TableHead>
                      <TableHead>Condizione</TableHead>
                      <TableHead>Finestra</TableHead>
                      <TableHead>Severità</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead className="w-24"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.data?.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{METRIC_LABEL[r.metric]}</TableCell>
                        <TableCell>
                          {r.comparator === "gt" ? ">" : "<"} {formatValue(r.metric, r.threshold)}
                        </TableCell>
                        <TableCell>{r.window_days}g · cd {r.cooldown_minutes}m</TableCell>
                        <TableCell><Badge variant={severityVariant(r.severity)}>{r.severity}</Badge></TableCell>
                        <TableCell>{r.is_active ? <Badge>attiva</Badge> : <Badge variant="outline">off</Badge>}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="icon"
                            onClick={async () => {
                              if (!confirm("Eliminare la regola?")) return;
                              try { await del.mutateAsync(r.id); toast.success("Regola eliminata"); }
                              catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); }
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Ultimi 100 eventi
              </CardTitle>
              <CardDescription>Soglie superate dalle valutazioni automatiche.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {events.isLoading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Caricamento…</p>
              ) : events.data?.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nessun evento.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Metrica</TableHead>
                      <TableHead>Osservato</TableHead>
                      <TableHead>Soglia</TableHead>
                      <TableHead>Severità</TableHead>
                      <TableHead>Regola</TableHead>
                      <TableHead className="w-32">Stato</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.data?.map((ev) => (
                      <TableRow key={ev.id}>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(ev.fired_at), "dd MMM HH:mm", { locale: it })}
                        </TableCell>
                        <TableCell>{METRIC_LABEL[ev.metric]}</TableCell>
                        <TableCell className="font-medium">{formatValue(ev.metric, ev.observed_value)}</TableCell>
                        <TableCell>
                          {ev.comparator === "gt" ? ">" : "<"} {formatValue(ev.metric, ev.threshold)}
                        </TableCell>
                        <TableCell><Badge variant={severityVariant(ev.severity)}>{ev.severity}</Badge></TableCell>
                        <TableCell className="text-xs">
                          {(ev.details as { rule_name?: string })?.rule_name ?? "—"}
                        </TableCell>
                        <TableCell>
                          {ev.acknowledged_at ? (
                            <Badge variant="outline" className="gap-1"><Check className="h-3 w-3" />ack</Badge>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              onClick={async () => {
                                try { await ack.mutateAsync(ev.id); toast.success("Evento acknowledged"); }
                                catch (e) { toast.error(e instanceof Error ? e.message : "Errore"); }
                              }}
                            >Ack</Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} />
    </div>
  );
}
