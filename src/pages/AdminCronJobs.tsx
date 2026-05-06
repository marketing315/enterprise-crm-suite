import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { MetricCard } from "@/components/admin/MetricCard";
import { Clock, AlertTriangle, ShieldCheck, Activity, XCircle, CheckCircle2, Loader2, Copy } from "lucide-react";
import { useCronJobs, useUnregisteredCronJobs, useCronRunLog } from "@/hooks/useCronJobs";
import { useCronErrorMetrics, useCronErrorTimeseries, useCronDuplicateJobs } from "@/hooks/useCronErrorMetrics";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from "recharts";

type RangeKey = "1h" | "6h" | "24h" | "7d" | "30d";
const RANGE_HOURS: Record<RangeKey, number> = { "1h": 1, "6h": 6, "24h": 24, "7d": 168, "30d": 720 };

function statusBadge(s: string) {
  switch (s) {
    case "success":
      return <Badge variant="outline" className="text-green-600 border-green-600/40"><CheckCircle2 className="h-3 w-3 mr-1" />success</Badge>;
    case "error":
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />error</Badge>;
    case "running":
      return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />running</Badge>;
    case "skipped":
      return <Badge variant="outline">skipped</Badge>;
    default:
      return <Badge variant="outline">{s}</Badge>;
  }
}

export default function AdminCronJobs() {
  const { data: jobs = [], isLoading: jobsLoading, error: jobsError } = useCronJobs();
  const { data: unregistered = [], isLoading: driftLoading } = useUnregisteredCronJobs();
  const { data: runs = [], isLoading: runsLoading } = useCronRunLog(150);

  const stats = useMemo(() => {
    const last24h = runs.filter(r => new Date(r.started_at).getTime() > Date.now() - 86_400_000);
    const errors24h = last24h.filter(r => r.status === "error").length;
    const success24h = last24h.filter(r => r.status === "success").length;
    const stuck = runs.filter(r => r.status === "running" && new Date(r.started_at).getTime() < Date.now() - 600_000).length;
    return { total: jobs.length, errors24h, success24h, stuck };
  }, [jobs, runs]);

  const inactive = jobs.filter(j => !j.active);
  const critical = jobs.filter(j => j.is_critical);

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Clock className="h-7 w-7 text-primary" />
          Cron Jobs &amp; Scheduler
        </h1>
        <p className="text-muted-foreground">
          Governance A10 — registry tenant-scoped, drift detection e telemetria run.
        </p>
      </div>

      {jobsError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore caricamento</AlertTitle>
          <AlertDescription>{(jobsError as Error).message}</AlertDescription>
        </Alert>
      )}

      {unregistered.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Drift rilevato — {unregistered.length} job non registrati</AlertTitle>
          <AlertDescription>
            I seguenti cron job sono schedulati ma assenti dal <code>cron_job_registry</code>.
            Aggiungili al registry per garantirne governance e ownership:
            <ul className="mt-2 list-disc list-inside">
              {unregistered.map(j => (
                <li key={j.jobid}><strong>{j.jobname}</strong> — <code>{j.schedule}</code></li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {stats.stuck > 0 && (
        <Alert variant="destructive">
          <Loader2 className="h-4 w-4" />
          <AlertTitle>{stats.stuck} run bloccati</AlertTitle>
          <AlertDescription>
            Esecuzioni in stato <code>running</code> da oltre 10 minuti. Verifica timeouts.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard title="Job schedulati" value={stats.total} icon={Activity} subtitle={`${critical.length} critici`} />
        <MetricCard title="Drift" value={unregistered.length} icon={AlertTriangle} variant={unregistered.length ? "danger" : "success"} subtitle="Job non registrati" />
        <MetricCard title="Successi 24h" value={stats.success24h} icon={CheckCircle2} variant="success" />
        <MetricCard title="Errori 24h" value={stats.errors24h} icon={XCircle} variant={stats.errors24h ? "danger" : "default"} subtitle={`${stats.stuck} bloccati`} />
      </div>

      <Tabs defaultValue="jobs">
        <TabsList>
          <TabsTrigger value="jobs">Job schedulati ({jobs.length})</TabsTrigger>
          <TabsTrigger value="runs">Run recenti ({runs.length})</TabsTrigger>
          <TabsTrigger value="inactive">Disattivati ({inactive.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="jobs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registro cron jobs</CardTitle>
              <CardDescription>JWT/apikey/Bearer token mascherati lato RPC.</CardDescription>
            </CardHeader>
            <CardContent>
              {jobsLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Owner</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Comando (redacted)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobs.map(j => (
                      <TableRow key={j.jobid}>
                        <TableCell className="font-mono text-xs">
                          {j.jobname}
                          {j.is_critical && <Badge variant="destructive" className="ml-2"><ShieldCheck className="h-3 w-3 mr-1" />critical</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{j.schedule}</TableCell>
                        <TableCell>
                          {j.registered ? (
                            <Badge variant="outline">{j.tenant_scope ?? "—"}</Badge>
                          ) : (
                            <Badge variant="destructive">unregistered</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{j.owner_role ?? "—"}</TableCell>
                        <TableCell>
                          {j.active ? <Badge variant="outline" className="text-green-600 border-green-600/40">active</Badge> : <Badge variant="secondary">inactive</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-md truncate" title={j.command_redacted}>
                          {j.command_redacted}
                        </TableCell>
                      </TableRow>
                    ))}
                    {jobs.length === 0 && !driftLoading && (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nessun job schedulato.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cron run log (ultime {runs.length})</CardTitle>
              <CardDescription>Append-only via RPC <code>cron_log_finish</code>.</CardDescription>
            </CardHeader>
            <CardContent>
              {runsLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead>Iniziato</TableHead>
                      <TableHead>Durata</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Errore</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.job_name}</TableCell>
                        <TableCell className="text-xs">{formatDistanceToNow(new Date(r.started_at), { addSuffix: true, locale: it })}</TableCell>
                        <TableCell className="text-xs">{r.duration_ms != null ? `${r.duration_ms} ms` : "—"}</TableCell>
                        <TableCell>{statusBadge(r.status)}</TableCell>
                        <TableCell className="text-xs text-destructive max-w-md truncate" title={r.error_summary ?? ""}>
                          {r.error_summary ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                    {runs.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nessuna esecuzione recente.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Job disattivati</CardTitle>
              <CardDescription>Job presenti in <code>cron.job</code> ma non attivi.</CardDescription>
            </CardHeader>
            <CardContent>
              {inactive.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nessun job disattivato.</div>
              ) : (
                <ul className="space-y-1 text-sm">
                  {inactive.map(j => (
                    <li key={j.jobid} className="font-mono text-xs">{j.jobname} — {j.schedule}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
