import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Activity, AlertTriangle, RefreshCw, FileCheck2, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";
import {
  useAccessReviews,
  useAccessReviewItems,
  useGenerateAccessReview,
  useUpdateReviewItem,
  useComplianceChangeLog,
  useCapacitySnapshots,
  useCapacityThresholds,
  useCaptureCapacitySnapshot,
  useAnomalyDetections,
  useAcknowledgeAnomaly,
  useTriggerAnomalyDetection,
} from "@/hooks/useComplianceCapacity";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

function SoC2Tab() {
  const { data: reviews = [], isLoading } = useAccessReviews();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: items = [] } = useAccessReviewItems(selectedId);
  const generate = useGenerateAccessReview();
  const updateItem = useUpdateReviewItem();
  const { data: changes = [] } = useComplianceChangeLog(50);
  const [period, setPeriod] = useState(currentQuarter());

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Access Reviews trimestrali
          </CardTitle>
          <CardDescription>
            Revisione periodica obbligatoria per SOC2 — ogni trimestre verifica chi ha accesso e a quale ruolo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 max-w-xs">
              <Label htmlFor="period">Periodo (es. 2026-Q2)</Label>
              <Input id="period" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
            <Button onClick={() => generate.mutate(period)} disabled={generate.isPending}>
              Genera review
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna review esistente.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Utenti</TableHead>
                  <TableHead>Revisionati</TableHead>
                  <TableHead>Revocati</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.review_period}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "completed" ? "default" : "secondary"}>{r.status}</Badge>
                    </TableCell>
                    <TableCell>{r.total_users}</TableCell>
                    <TableCell>{r.reviewed_users}</TableCell>
                    <TableCell>{r.revoked_count}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => setSelectedId(r.id === selectedId ? null : r.id)}>
                        {r.id === selectedId ? "Chiudi" : "Apri"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {selectedId && items.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <h4 className="font-semibold mb-3">Utenti da revisionare ({items.length})</h4>
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Ruolo</TableHead>
                      <TableHead>Decisione</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{item.user_email}</TableCell>
                        <TableCell className="text-xs font-mono">{item.current_role_label ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant={item.decision === "keep" ? "default" : "outline"}
                              onClick={() => updateItem.mutate({ id: item.id, review_id: selectedId, decision: "keep" })}
                            >
                              Keep
                            </Button>
                            <Button
                              size="sm"
                              variant={item.decision === "revoke" ? "destructive" : "outline"}
                              onClick={() => updateItem.mutate({ id: item.id, review_id: selectedId, decision: "revoke" })}
                            >
                              Revoke
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="h-5 w-5" />
            Change log immutabile
          </CardTitle>
          <CardDescription>Append-only — ogni modifica di permessi/ruoli/segreti è tracciata per audit SOC2.</CardDescription>
        </CardHeader>
        <CardContent>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna modifica registrata.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Attore</TableHead>
                  <TableHead>Risorsa</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {changes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(c.occurred_at), { addSuffix: true, locale: it })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{c.change_type}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{c.actor_email ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{c.target_resource ?? "—"}</TableCell>
                    <TableCell className="text-xs">{c.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CapacityTab() {
  const { data: snapshots = [] } = useCapacitySnapshots();
  const { data: thresholds = [] } = useCapacityThresholds();
  const capture = useCaptureCapacitySnapshot();

  // Get latest value per metric
  const latestByMetric = new Map<string, number>();
  for (const s of snapshots) {
    if (!latestByMetric.has(s.metric_name)) latestByMetric.set(s.metric_name, s.metric_value);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Capacity planning
              </CardTitle>
              <CardDescription>Snapshot ogni 6h. Soglie warn/critical per uso risorse.</CardDescription>
            </div>
            <Button onClick={() => capture.mutate()} disabled={capture.isPending} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Snapshot ora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metrica</TableHead>
                <TableHead>Valore attuale</TableHead>
                <TableHead>Warn</TableHead>
                <TableHead>Critical</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {thresholds.map((t) => {
                const v = latestByMetric.get(t.metric_name) ?? 0;
                const status = v >= t.critical_threshold ? "critical" : v >= t.warn_threshold ? "warn" : "ok";
                return (
                  <TableRow key={t.metric_name}>
                    <TableCell className="font-mono text-xs">{t.metric_name}</TableCell>
                    <TableCell className="font-semibold">
                      {v.toLocaleString("it-IT", { maximumFractionDigits: 1 })} {t.unit}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.warn_threshold.toLocaleString()}</TableCell>
                    <TableCell className="text-muted-foreground">{t.critical_threshold.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={status === "critical" ? "destructive" : status === "warn" ? "secondary" : "outline"}>
                        {status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AnomalyTab() {
  const { data: detections = [] } = useAnomalyDetections(false);
  const ack = useAcknowledgeAnomaly();
  const trigger = useTriggerAnomalyDetection();
  const unacked = detections.filter((d) => !d.acknowledged_at);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Anomaly detection ({unacked.length} non confermate)
              </CardTitle>
              <CardDescription>Z-score su baseline rolling 14 giorni. Soglie: |z|≥2 info, ≥3 warn, ≥4 critical.</CardDescription>
            </div>
            <Button onClick={() => trigger.mutate()} disabled={trigger.isPending} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Detect ora
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {detections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna anomalia rilevata.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Metrica</TableHead>
                  <TableHead>Direzione</TableHead>
                  <TableHead>Atteso → Osservato</TableHead>
                  <TableHead>Z-score</TableHead>
                  <TableHead>Severità</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detections.map((d) => (
                  <TableRow key={d.id} className={d.acknowledged_at ? "opacity-50" : ""}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDistanceToNow(new Date(d.detected_at), { addSuffix: true, locale: it })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.metric_name}</TableCell>
                    <TableCell>
                      {d.direction === "spike" ? (
                        <TrendingUp className="h-4 w-4 text-orange-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-blue-500" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      {d.expected_value.toFixed(1)} → <strong>{d.observed_value.toFixed(1)}</strong>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{d.z_score.toFixed(2)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          d.severity === "critical" ? "destructive" : d.severity === "warning" ? "secondary" : "outline"
                        }
                      >
                        {d.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {d.acknowledged_at ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => ack.mutate(d.id)}>
                          Conferma
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCompliance() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Compliance & Operations</h1>
        <p className="text-muted-foreground">
          SOC2 readiness, capacity planning e anomaly detection — strumenti di governance enterprise.
        </p>
      </div>

      <Tabs defaultValue="soc2" className="w-full">
        <TabsList>
          <TabsTrigger value="soc2">SOC2 Readiness</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="anomaly">Anomaly Detection</TabsTrigger>
        </TabsList>
        <TabsContent value="soc2" className="mt-6"><SoC2Tab /></TabsContent>
        <TabsContent value="capacity" className="mt-6"><CapacityTab /></TabsContent>
        <TabsContent value="anomaly" className="mt-6"><AnomalyTab /></TabsContent>
      </Tabs>
    </div>
  );
}
