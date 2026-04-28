import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Activity, ShieldAlert, Package, Gauge } from "lucide-react";
import {
  useSloDefinitions,
  useLatestSloMeasurements,
  useDependencyInventory,
  useRecentTraces,
  useRedMetrics,
} from "@/hooks/useObservability";

const formatPct = (v: number | null | undefined, digits = 2) =>
  v == null ? "—" : `${(v * 100).toFixed(digits)}%`;

const burnBadge = (v: number | null | undefined) => {
  if (v == null) return <Badge variant="outline">—</Badge>;
  if (v >= 14.4) return <Badge variant="destructive">Critical {v.toFixed(1)}x</Badge>;
  if (v >= 6) return <Badge className="bg-orange-500">High {v.toFixed(1)}x</Badge>;
  if (v >= 1) return <Badge className="bg-yellow-500">Warn {v.toFixed(1)}x</Badge>;
  return <Badge variant="secondary">{v.toFixed(2)}x</Badge>;
};

export default function AdminObservability() {
  const [depFilter, setDepFilter] = useState("");
  const slos = useSloDefinitions();
  const measurements = useLatestSloMeasurements();
  const deps = useDependencyInventory();
  const traces = useRecentTraces();
  const red = useRedMetrics(60);

  const measurementBySlo = new Map(measurements.data?.map((m) => [m.slo_id, m]) ?? []);
  const filteredDeps = (deps.data ?? []).filter((d) =>
    !depFilter || d.package_name.toLowerCase().includes(depFilter.toLowerCase()),
  );
  const vulnCount = (deps.data ?? []).filter((d) => d.has_vulnerability).length;

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Observability & SLO</h1>
        <p className="text-muted-foreground">Error budget, RED metrics, dipendenze e tracing distribuito.</p>
      </div>

      <Tabs defaultValue="slo" className="space-y-4">
        <TabsList>
          <TabsTrigger value="slo"><Gauge className="w-4 h-4 mr-2" />SLO</TabsTrigger>
          <TabsTrigger value="red"><Activity className="w-4 h-4 mr-2" />RED Metrics</TabsTrigger>
          <TabsTrigger value="traces"><Activity className="w-4 h-4 mr-2" />Traces</TabsTrigger>
          <TabsTrigger value="deps">
            <Package className="w-4 h-4 mr-2" />Dependencies
            {vulnCount > 0 && <Badge variant="destructive" className="ml-2">{vulnCount}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="slo">
          <Card>
            <CardHeader><CardTitle>Service Level Objectives</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>SLI corrente</TableHead>
                    <TableHead>Error budget</TableHead>
                    <TableHead>Burn 1h</TableHead>
                    <TableHead>Burn 6h</TableHead>
                    <TableHead>Burn 24h</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(slos.data ?? []).map((s) => {
                    const m = measurementBySlo.get(s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="font-medium">{s.name}</div>
                          <div className="text-xs text-muted-foreground">{s.service_name}</div>
                        </TableCell>
                        <TableCell>{s.target_percentage}% / {s.window_days}d</TableCell>
                        <TableCell>{formatPct(m?.current_sli)}</TableCell>
                        <TableCell>
                          {m?.error_budget_remaining != null ? (
                            <Badge variant={m.error_budget_remaining < 20 ? "destructive" : "secondary"}>
                              {m.error_budget_remaining.toFixed(1)}%
                            </Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>{burnBadge(m?.burn_rate_1h)}</TableCell>
                        <TableCell>{burnBadge(m?.burn_rate_6h)}</TableCell>
                        <TableCell>{burnBadge(m?.burn_rate_24h)}</TableCell>
                      </TableRow>
                    );
                  })}
                  {(slos.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nessun SLO definito</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="red">
          <Card>
            <CardHeader><CardTitle>RED Metrics — ultimi 60 minuti</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Servizio</TableHead>
                    <TableHead>Rate (req/min)</TableHead>
                    <TableHead>Error %</TableHead>
                    <TableHead>p50</TableHead>
                    <TableHead>p95</TableHead>
                    <TableHead>p99</TableHead>
                    <TableHead>Totale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(red.data ?? []).map((m) => (
                    <TableRow key={m.service}>
                      <TableCell className="font-medium">{m.service}</TableCell>
                      <TableCell>{m.rate_per_min.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={m.error_pct > 5 ? "destructive" : m.error_pct > 1 ? "default" : "secondary"}>
                          {m.error_pct.toFixed(2)}%
                        </Badge>
                      </TableCell>
                      <TableCell>{m.p50_ms} ms</TableCell>
                      <TableCell>{m.p95_ms} ms</TableCell>
                      <TableCell>{m.p99_ms} ms</TableCell>
                      <TableCell>{m.total}</TableCell>
                    </TableRow>
                  ))}
                  {(red.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Nessun trace registrato. Invia eventi a <code>trace-ingest</code>.</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="traces">
          <Card>
            <CardHeader><CardTitle>Trace recenti</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Service / Op</TableHead>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(traces.data ?? []).slice(0, 100).map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="text-xs">{new Date(t.started_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="font-medium">{t.service_name}</div>
                        <div className="text-xs text-muted-foreground">{t.operation_name}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{t.trace_id.slice(0, 12)}…</TableCell>
                      <TableCell>{t.duration_ms} ms</TableCell>
                      <TableCell>
                        <Badge variant={t.status_code === "error" ? "destructive" : t.status_code === "timeout" ? "default" : "secondary"}>
                          {t.status_code}{t.http_status ? ` ${t.http_status}` : ""}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(traces.data ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Nessun trace</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deps">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Dependency Inventory (SBOM)</span>
                {vulnCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <ShieldAlert className="w-3 h-3" />{vulnCount} vulnerabili
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Filtra per nome pacchetto…"
                value={depFilter}
                onChange={(e) => setDepFilter(e.target.value)}
                className="max-w-sm"
              />
              {(deps.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Inventario vuoto. Esegui <code>./scripts/generate-sbom.sh --upload</code> per popolarlo.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pacchetto</TableHead>
                    <TableHead>Versione</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Vulnerabilità</TableHead>
                    <TableHead>Ultimo scan</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDeps.slice(0, 200).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-sm">{d.package_name}</TableCell>
                      <TableCell>{d.current_version}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{d.is_dev_dependency ? "dev" : "prod"}</Badge>
                      </TableCell>
                      <TableCell>
                        {d.has_vulnerability ? (
                          <Badge variant="destructive">{d.vulnerability_severity ?? "unknown"}</Badge>
                        ) : <Badge variant="secondary">clean</Badge>}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(d.last_scanned_at).toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
