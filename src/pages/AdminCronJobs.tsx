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
import { useCronErrorMetrics, useCronErrorTimeseries, useCronDuplicateJobs, useCronRelayStatus } from "@/hooks/useCronErrorMetrics";
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

  const { brands, currentBrand } = useBrand();
  const [range, setRange] = useState<RangeKey>("24h");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [jobFilter, setJobFilter] = useState<string>("all");

  const { from, to } = useMemo(() => {
    const t = new Date();
    const f = new Date(t.getTime() - RANGE_HOURS[range] * 3_600_000);
    return { from: f, to: t };
  }, [range]);

  // Default brand filter to current brand if not system
  const effectiveBrandId = brandFilter === "all"
    ? null
    : brandFilter === "current"
      ? (currentBrand && currentBrand.id !== SYSTEM_BRAND_ID ? currentBrand.id : null)
      : brandFilter;

  const { data: errMetrics = [], isLoading: emLoading } = useCronErrorMetrics(from, to, effectiveBrandId);
  const { data: timeseries = [], isLoading: tsLoading } = useCronErrorTimeseries(
    from,
    to,
    effectiveBrandId,
    jobFilter === "all" ? null : jobFilter,
  );
  const { data: duplicates = [], isLoading: dupLoading } = useCronDuplicateJobs();
  const { data: relayStatus = [], isLoading: relayLoading } = useCronRelayStatus(from, to, effectiveBrandId);
  const brandName = (id: string | null) => {
    if (!id) return "system";
    const b = brands.find(x => x.id === id);
    return b?.name ?? id.slice(0, 8);
  };

  const errStats = useMemo(() => {
    const totalErrors = errMetrics.reduce((s, m) => s + Number(m.errors || 0), 0);
    const totalRuns = errMetrics.reduce((s, m) => s + Number(m.total || 0), 0);
    const jobsWithErrors = errMetrics.filter(m => Number(m.errors || 0) > 0).length;
    const errorRate = totalRuns > 0 ? Math.round((totalErrors / totalRuns) * 1000) / 10 : 0;
    return { totalErrors, totalRuns, jobsWithErrors, errorRate };
  }, [errMetrics]);

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

      <Tabs defaultValue="errors">
        <TabsList>
          <TabsTrigger value="errors">Errori &amp; metriche</TabsTrigger>
          <TabsTrigger value="relay">Relay status ({relayStatus.length})</TabsTrigger>
          <TabsTrigger value="duplicates">Duplicati ({duplicates.length})</TabsTrigger>
          <TabsTrigger value="jobs">Job schedulati ({jobs.length})</TabsTrigger>
          <TabsTrigger value="runs">Run recenti ({runs.length})</TabsTrigger>
          <TabsTrigger value="inactive">Disattivati ({inactive.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filtri</CardTitle>
              <CardDescription>Aggregati da <code>cron_relay_log</code>. Errori = upstream_status nullo, 0 o ≥ 400.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <Label className="text-xs">Intervallo</Label>
                  <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1h">Ultima ora</SelectItem>
                      <SelectItem value="6h">Ultime 6 ore</SelectItem>
                      <SelectItem value="24h">Ultime 24 ore</SelectItem>
                      <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
                      <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Brand</Label>
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i brand</SelectItem>
                      <SelectItem value="current">Brand corrente</SelectItem>
                      {brands.filter(b => b.id !== SYSTEM_BRAND_ID).map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Job</Label>
                  <Select value={jobFilter} onValueChange={setJobFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti i job</SelectItem>
                      {errMetrics.map(m => (
                        <SelectItem key={m.job_name} value={m.job_name}>{m.job_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Esecuzioni totali" value={errStats.totalRuns} icon={Activity} subtitle={`${range}`} />
            <MetricCard title="Errori" value={errStats.totalErrors} icon={XCircle} variant={errStats.totalErrors ? "danger" : "success"} />
            <MetricCard title="Job in errore" value={errStats.jobsWithErrors} icon={AlertTriangle} variant={errStats.jobsWithErrors ? "danger" : "default"} />
            <MetricCard title="Error rate" value={`${errStats.errorRate}%`} icon={XCircle} variant={errStats.errorRate > 5 ? "danger" : "default"} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Andamento orario</CardTitle>
              <CardDescription>Esecuzioni per ora. {jobFilter !== "all" ? `Filtro: ${jobFilter}` : "Tutti i job."}</CardDescription>
            </CardHeader>
            <CardContent>
              {tsLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento…</div>
              ) : timeseries.length === 0 ? (
                <div className="text-sm text-muted-foreground">Nessun dato nel range selezionato.</div>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={timeseries.map(b => ({
                      time: format(new Date(b.bucket), range === "1h" || range === "6h" ? "HH:mm" : "dd/MM HH:mm"),
                      errors: Number(b.errors),
                      successes: Number(b.successes),
                    }))}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="successes" stackId="a" fill="hsl(var(--primary))" name="Successi" />
                      <Bar dataKey="errors" stackId="a" fill="hsl(var(--destructive))" name="Errori" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dettaglio per job</CardTitle>
              <CardDescription>Ordinati per numero errori.</CardDescription>
            </CardHeader>
            <CardContent>
              {emLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento…</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job</TableHead>
                      <TableHead className="text-right">Totali</TableHead>
                      <TableHead className="text-right">Successi</TableHead>
                      <TableHead className="text-right">Errori</TableHead>
                      <TableHead className="text-right">Error rate</TableHead>
                      <TableHead>Ultimo errore</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {errMetrics.map(m => (
                      <TableRow key={m.job_name}>
                        <TableCell className="font-mono text-xs">{m.job_name}</TableCell>
                        <TableCell className="text-right text-xs">{m.total}</TableCell>
                        <TableCell className="text-right text-xs text-green-600">{m.successes}</TableCell>
                        <TableCell className="text-right text-xs text-destructive">{m.errors}</TableCell>
                        <TableCell className="text-right text-xs">
                          {Number(m.error_rate) > 5
                            ? <Badge variant="destructive">{m.error_rate}%</Badge>
                            : <span>{m.error_rate}%</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.last_error_at ? formatDistanceToNow(new Date(m.last_error_at), { addSuffix: true, locale: it }) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          {m.last_error_status != null ? <Badge variant="outline">{m.last_error_status || "0"}</Badge> : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {errMetrics.length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nessun dato nel range.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="duplicates" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Cron jobs duplicati ({duplicates.length})
              </CardTitle>
              <CardDescription>
                Job con lo stesso <code>jobname</code> registrati più volte in <code>cron.job</code>.
                Spesso causa di flood 401/403 quando un duplicato legacy bypassa <code>cron-relay</code>.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dupLoading ? (
                <div className="text-sm text-muted-foreground">Caricamento…</div>
              ) : duplicates.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Nessun duplicato</AlertTitle>
                  <AlertDescription>Tutti i cron job hanno nome univoco.</AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job name</TableHead>
                      <TableHead className="text-right">Occorrenze</TableHead>
                      <TableHead className="text-right">Attivi</TableHead>
                      <TableHead>Job IDs</TableHead>
                      <TableHead>Schedules</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {duplicates.map(d => (
                      <TableRow key={d.jobname}>
                        <TableCell className="font-mono text-xs">{d.jobname}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="destructive">{d.occurrences}</Badge>
                        </TableCell>
                        <TableCell className="text-right text-xs">{d.active_count}</TableCell>
                        <TableCell className="font-mono text-xs">{d.jobids.join(", ")}</TableCell>
                        <TableCell className="font-mono text-xs">{d.schedules.join(" | ")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>


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
