import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCcw,
  RotateCw,
  Skull,
  Timer,
  TrendingDown,
} from "lucide-react";
import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface HealthRow {
  destination_id: string;
  destination_name: string;
  preset: string;
  is_active: boolean;
  total_attempts: number;
  sent_count: number;
  failed_count: number;
  dead_letter_count: number;
  pending_count: number;
  success_rate: number;
  avg_latency_seconds: number;
  p95_latency_seconds: number;
  last_success_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
}

interface DeadLetterRow {
  id: string;
  destination_id: string;
  notification_type: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
}

function healthVariant(rate: number, total: number): "default" | "secondary" | "destructive" {
  if (total === 0) return "secondary";
  if (rate >= 95) return "default";
  if (rate >= 80) return "secondary";
  return "destructive";
}

export function WebhookHealthDashboard() {
  const { currentBrand } = useBrand();
  const qc = useQueryClient();
  const brandId = currentBrand?.id ?? null;
  const [fromHours, setFromHours] = useState("24");

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["webhook-delivery-health", brandId, fromHours],
    enabled: !!brandId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_webhook_delivery_health" as never,
        {
          p_brand_id: brandId,
          p_from_hours: Number(fromHours),
        } as never
      );
      if (error) throw error;
      return (data ?? []) as unknown as HealthRow[];
    },
  });

  const { data: deadLetters = [] } = useQuery({
    queryKey: ["webhook-dead-letters", brandId],
    enabled: !!brandId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notification_webhook_outbox")
        .select("id, destination_id, notification_type, attempts, last_error, created_at")
        .eq("brand_id", brandId!)
        .eq("status", "dead_letter")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as unknown as DeadLetterRow[];
    },
  });

  const replayMut = useMutation({
    mutationFn: async (outboxId: string) => {
      const { data, error } = await supabase.rpc(
        "replay_webhook_dead_letter" as never,
        { p_outbox_id: outboxId } as never
      );
      if (error) throw error;
      return data as unknown as boolean;
    },
    onSuccess: (ok) => {
      if (ok) {
        toast.success("Webhook rimesso in coda");
        qc.invalidateQueries({ queryKey: ["webhook-dead-letters"] });
        qc.invalidateQueries({ queryKey: ["webhook-delivery-health"] });
        qc.invalidateQueries({ queryKey: ["notification-webhook-outbox"] });
      } else {
        toast.warning("Riga non in dead-letter o non trovata");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Aggregate top-level KPIs
  const totals = rows.reduce(
    (acc, r) => {
      acc.total += r.total_attempts;
      acc.sent += r.sent_count;
      acc.dead += r.dead_letter_count;
      acc.pending += r.pending_count;
      return acc;
    },
    { total: 0, sent: 0, dead: 0, pending: 0 }
  );
  const overallRate = totals.total > 0 ? Math.round((totals.sent / totals.total) * 1000) / 10 : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Health globale
              </CardTitle>
              <CardDescription>
                Aggregato su tutte le destinazioni del brand attivo
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={fromHours} onValueChange={setFromHours}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ultima 1h</SelectItem>
                  <SelectItem value="6">Ultime 6h</SelectItem>
                  <SelectItem value="24">Ultime 24h</SelectItem>
                  <SelectItem value="72">Ultimi 3g</SelectItem>
                  <SelectItem value="168">Ultimi 7g</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCcw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Aggiorna
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiTile label="Tentativi" value={totals.total} icon={Activity} />
            <KpiTile
              label="Success rate"
              value={`${overallRate}%`}
              icon={CheckCircle2}
              tone={overallRate >= 95 ? "success" : overallRate >= 80 ? "warning" : "danger"}
            />
            <KpiTile
              label="In attesa"
              value={totals.pending}
              icon={Clock}
              tone={totals.pending > 0 ? "warning" : "muted"}
            />
            <KpiTile
              label="Dead-letter"
              value={totals.dead}
              icon={Skull}
              tone={totals.dead > 0 ? "danger" : "muted"}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per destinazione</CardTitle>
          <CardDescription>
            Latenza media + p95 sui soli messaggi consegnati. Dead-letter = abbandonati dopo {`>`} retry max.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          {!isLoading && rows.length === 0 && (
            <p className="text-center py-8 text-sm text-muted-foreground">
              Nessuna destinazione configurata.
            </p>
          )}

          {rows.map((r) => (
            <div
              key={r.destination_id}
              className="rounded-lg border p-3 bg-card hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.destination_name}</span>
                    <Badge variant="outline" className="text-xs">{r.preset}</Badge>
                    {!r.is_active && (
                      <Badge variant="secondary" className="text-xs">disattivato</Badge>
                    )}
                    {r.consecutive_failures > 0 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <TrendingDown className="h-3 w-3" />
                        {r.consecutive_failures} fail consec.
                      </Badge>
                    )}
                  </div>
                  {r.last_error && (
                    <p className="text-xs text-destructive mt-1 truncate max-w-xl">
                      <AlertTriangle className="h-3 w-3 inline mr-1" />
                      {r.last_error}
                    </p>
                  )}
                  {r.last_success_at && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Ultimo successo {formatDistanceToNow(new Date(r.last_success_at), { locale: it, addSuffix: true })}
                    </p>
                  )}
                </div>
                <Badge variant={healthVariant(r.success_rate, r.total_attempts)} className="text-xs">
                  {r.total_attempts > 0 ? `${r.success_rate}%` : "no traffic"}
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3 text-xs">
                <Metric label="Tentativi" value={r.total_attempts} />
                <Metric label="Inviati" value={r.sent_count} tone="success" />
                <Metric label="Falliti" value={r.failed_count} tone={r.failed_count > 0 ? "warning" : undefined} />
                <Metric label="Dead-letter" value={r.dead_letter_count} tone={r.dead_letter_count > 0 ? "danger" : undefined} />
                <Metric
                  label="Latenza p95"
                  value={r.total_attempts > 0 ? `${r.p95_latency_seconds}s` : "—"}
                  icon={Timer}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {deadLetters.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Skull className="h-4 w-4 text-destructive" />
              Dead-letter queue ({deadLetters.length})
            </CardTitle>
            <CardDescription>
              Webhook abbandonati dopo aver superato i retry. Premi <strong>Replay</strong> per rimetterli in coda.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {deadLetters.map((d) => {
              const dest = rows.find((r) => r.destination_id === d.destination_id);
              return (
                <div
                  key={d.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 bg-card"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="destructive" className="text-xs">dead</Badge>
                      <span className="font-mono text-xs">{d.notification_type}</span>
                      <span className="text-xs text-muted-foreground">
                        → {dest?.destination_name ?? d.destination_id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {d.attempts} tentativi
                      </span>
                    </div>
                    {d.last_error && (
                      <p className="text-xs text-muted-foreground mt-1 truncate max-w-2xl">
                        {d.last_error}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => replayMut.mutate(d.id)}
                    disabled={replayMut.isPending}
                    className="gap-1.5 shrink-0"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    Replay
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KpiTile({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "danger" | "muted";
}) {
  const cls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "danger"
      ? "text-destructive"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-lg border p-3 bg-card">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <p className={`text-2xl font-semibold mt-1 ${cls}`}>{value}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  tone?: "success" | "warning" | "danger";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const cls =
    tone === "success"
      ? "text-emerald-600"
      : tone === "warning"
      ? "text-amber-600"
      : tone === "danger"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div>
      <div className="text-muted-foreground flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </div>
      <div className={`font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
