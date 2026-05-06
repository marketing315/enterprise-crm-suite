import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricCard } from "@/components/admin/MetricCard";
import { Activity, AlertTriangle, CheckCircle2, FileSpreadsheet, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

interface DriftRow {
  id: string;
  checked_at: string;
  window_minutes: number;
  lead_events_count: number;
  exports_success_count: number;
  exports_pending_count: number;
  exports_failed_count: number;
  success_ratio: number;
  status: "ok" | "warn" | "critical";
  incident_fired: boolean;
}

interface TriggerLogRow {
  id: string;
  checked_at: string;
  trigger_name: string;
  table_name: string;
  present: boolean;
  auto_recreated: boolean;
  recreate_error: string | null;
}

interface ReconRow {
  id: string;
  run_at: string;
  period_start: string;
  period_end: string;
  db_count: number;
  sheet_count: number;
  delta: number;
  delta_pct: number;
  status: string;
  backfill_enqueued: number;
}

interface RegistryRow {
  id: string;
  trigger_name: string;
  table_name: string;
  function_name: string;
  description: string | null;
  is_active: boolean;
}

function statusBadge(s: string) {
  if (s === "ok") return <Badge variant="outline" className="text-green-600 border-green-600/40"><CheckCircle2 className="h-3 w-3 mr-1" />ok</Badge>;
  if (s === "warn" || s === "drift") return <Badge variant="outline" className="text-yellow-600 border-yellow-600/40"><AlertTriangle className="h-3 w-3 mr-1" />{s}</Badge>;
  if (s === "critical") return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />critical</Badge>;
  return <Badge variant="outline">{s}</Badge>;
}

export default function AdminSheetsHealth() {
  const drift = useQuery({
    queryKey: ["sheets-drift-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sheets_export_drift_log" as any)
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(96);
      if (error) throw error;
      return (data ?? []) as unknown as DriftRow[];
    },
    refetchInterval: 60_000,
  });

  const triggers = useQuery({
    queryKey: ["critical-triggers-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("critical_triggers_registry" as any)
        .select("*")
        .order("trigger_name");
      if (error) throw error;
      return (data ?? []) as unknown as RegistryRow[];
    },
  });

  const triggerLog = useQuery({
    queryKey: ["critical-triggers-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("critical_triggers_check_log" as any)
        .select("*")
        .order("checked_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as TriggerLogRow[];
    },
  });

  const recon = useQuery({
    queryKey: ["sheets-recon-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sheets_reconciliation_log" as any)
        .select("*")
        .order("run_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as ReconRow[];
    },
  });

  const last = drift.data?.[0];
  const last24h = useMemo(() => {
    const cutoff = Date.now() - 86_400_000;
    return (drift.data ?? []).filter(d => new Date(d.checked_at).getTime() > cutoff);
  }, [drift.data]);

  const incidents24h = last24h.filter(d => d.status === "critical").length;
  const lastTriggerCheck = triggerLog.data?.[0];
  const missingTriggers = (triggers.data ?? []).filter(t => {
    const recent = (triggerLog.data ?? []).find(l => l.trigger_name === t.trigger_name);
    return recent && !recent.present;
  });

  async function runManualCheck(target: string) {
    try {
      const { data, error } = await supabase.functions.invoke(target, { body: {} });
      if (error) throw error;
      toast.success(`${target} eseguito`, { description: JSON.stringify(data).slice(0, 120) });
      drift.refetch();
      triggerLog.refetch();
      recon.refetch();
    } catch (e: any) {
      toast.error(`Errore ${target}`, { description: e?.message ?? String(e) });
    }
  }

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="h-7 w-7 text-primary" />
          Sheet Export Health
        </h1>
        <p className="text-muted-foreground">
          Monitoraggio del flusso lead → Google Sheet. Rileva drift in &lt; 1 ora e auto-ripristina trigger mancanti.
        </p>
      </div>

      {last?.status === "critical" && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Export bloccato</AlertTitle>
          <AlertDescription>
            Ultimo check ({formatDistanceToNow(new Date(last.checked_at), { addSuffix: true, locale: it })}):
            {" "}{last.lead_events_count} lead vs {last.exports_success_count} export riusciti.
          </AlertDescription>
        </Alert>
      )}

      {missingTriggers.length > 0 && (
        <Alert variant="destructive">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Trigger critici mancanti</AlertTitle>
          <AlertDescription>
            {missingTriggers.map(t => t.trigger_name).join(", ")}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard
          icon={Activity}
          label="Stato attuale"
          value={last ? last.status.toUpperCase() : "—"}
          description={last ? `${last.success_ratio}% success ratio` : "Nessun dato"}
        />
        <MetricCard
          icon={AlertTriangle}
          label="Incidenti 24h"
          value={String(incidents24h)}
          description="Drift critical rilevati"
        />
        <MetricCard
          icon={ShieldCheck}
          label="Trigger critici"
          value={`${(triggers.data ?? []).length - missingTriggers.length}/${(triggers.data ?? []).length}`}
          description={lastTriggerCheck ? `Ultimo check ${formatDistanceToNow(new Date(lastTriggerCheck.checked_at), { addSuffix: true, locale: it })}` : "Mai eseguito"}
        />
        <MetricCard
          icon={CheckCircle2}
          label="Ultimo recon"
          value={recon.data?.[0] ? `Δ ${recon.data[0].delta_pct}%` : "—"}
          description={recon.data?.[0] ? `${recon.data[0].db_count} DB / ${recon.data[0].sheet_count} sheet` : "In attesa"}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => runManualCheck("sheets-export-slo-check")}>
          <RefreshCw className="h-3 w-3 mr-1" /> Esegui SLO check
        </Button>
        <Button variant="outline" size="sm" onClick={() => runManualCheck("verify-critical-triggers")}>
          <RefreshCw className="h-3 w-3 mr-1" /> Verifica trigger
        </Button>
        <Button variant="outline" size="sm" onClick={() => runManualCheck("sheets-reconciliation")}>
          <RefreshCw className="h-3 w-3 mr-1" /> Reconciliation ora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Drift export — ultime 24h</CardTitle>
          <CardDescription>Snapshot ogni 15 minuti su finestra mobile di 1 ora</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Success</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Ratio</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {last24h.slice(0, 30).map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-muted-foreground">
                    {formatDistanceToNow(new Date(d.checked_at), { addSuffix: true, locale: it })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.lead_events_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.exports_success_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.exports_pending_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.exports_failed_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.success_ratio}%</TableCell>
                  <TableCell>{statusBadge(d.status)}</TableCell>
                </TableRow>
              ))}
              {last24h.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">In attesa del primo snapshot</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trigger critici registrati</CardTitle>
          <CardDescription>Verificati ogni notte alle 02:00 con auto-recreate</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger</TableHead>
                <TableHead>Tabella</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Ultima verifica</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(triggers.data ?? []).map(t => {
                const log = (triggerLog.data ?? []).find(l => l.trigger_name === t.trigger_name);
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.trigger_name}</TableCell>
                    <TableCell className="font-mono text-xs">{t.table_name}</TableCell>
                    <TableCell>
                      {log ? (log.present
                        ? <Badge variant="outline" className="text-green-600 border-green-600/40">presente</Badge>
                        : <Badge variant="destructive">mancante</Badge>)
                        : <Badge variant="outline">non verificato</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {log ? formatDistanceToNow(new Date(log.checked_at), { addSuffix: true, locale: it }) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation DB ↔ Sheet</CardTitle>
          <CardDescription>Confronto giornaliero su finestra di 7 giorni</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead className="text-right">DB</TableHead>
                <TableHead className="text-right">Sheet</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Backfill</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(recon.data ?? []).map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-muted-foreground">{formatDistanceToNow(new Date(r.run_at), { addSuffix: true, locale: it })}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.db_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.sheet_count}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.delta}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.delta_pct}%</TableCell>
                  <TableCell className="text-right tabular-nums">{r.backfill_enqueued}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                </TableRow>
              ))}
              {(recon.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">In attesa della prima reconciliation (notte 03:00)</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
