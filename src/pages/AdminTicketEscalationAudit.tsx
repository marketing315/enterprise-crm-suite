import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTicketEscalationAudit, type EscalationOutcome } from "@/hooks/useTicketEscalationAudit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TicketEscalationPolicyPanel } from "@/components/admin/TicketEscalationPolicyPanel";
import { TicketEscalationSimulator } from "@/components/admin/TicketEscalationSimulator";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Settings2,
  TimerReset,
  UserX,
  XCircle,
  FlaskConical,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

const LEVEL_LABEL: Record<number, string> = {
  1: "L1 · 30 min",
  2: "L2 · 120 min",
  3: "L3 · 480 min",
};

const OUTCOME_META: Record<
  EscalationOutcome,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<{ className?: string }> }
> = {
  risolto: { label: "Risolto", variant: "default", icon: CheckCircle2 },
  visto: { label: "Visto", variant: "secondary", icon: Bell },
  pending: { label: "In attesa", variant: "outline", icon: Clock },
  ignorato: { label: "Ignorato", variant: "destructive", icon: XCircle },
  no_manager: { label: "Nessun manager", variant: "destructive", icon: UserX },
};

function LevelDot({ level }: { level: number }) {
  const color =
    level >= 3
      ? "bg-destructive"
      : level === 2
      ? "bg-orange-500"
      : "bg-yellow-500";
  return (
    <div className="relative flex h-full flex-col items-center">
      <div className={`mt-2 h-3 w-3 rounded-full ring-4 ring-background ${color}`} />
      <div className="flex-1 w-px bg-border mt-1" />
    </div>
  );
}

export default function AdminTicketEscalationAudit() {
  const [level, setLevel] = useState<string>("all");
  const [fromDays, setFromDays] = useState<string>("30");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");

  const { data, isLoading, refetch, isFetching } = useTicketEscalationAudit({
    level: level === "all" ? null : Number(level),
    fromDays: Number(fromDays),
    limit: 300,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (outcomeFilter === "all") return data;
    return data.filter((r) => r.outcome === outcomeFilter);
  }, [data, outcomeFilter]);

  const stats = useMemo(() => {
    if (!data) return { total: 0, l1: 0, l2: 0, l3: 0, pending: 0, resolved: 0, ignored: 0, noManager: 0 };
    return {
      total: data.length,
      l1: data.filter((r) => r.escalation_level === 1).length,
      l2: data.filter((r) => r.escalation_level === 2).length,
      l3: data.filter((r) => r.escalation_level === 3).length,
      pending: data.filter((r) => r.outcome === "pending" || r.outcome === "visto").length,
      resolved: data.filter((r) => r.outcome === "risolto").length,
      ignored: data.filter((r) => r.outcome === "ignorato").length,
      noManager: data.filter((r) => r.outcome === "no_manager").length,
    };
  }, [data]);

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-7xl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            Audit Escalation Ticket
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Timeline delle escalation SLA e configurazione policy gerarchiche per brand.
          </p>
        </div>
      </header>

      <Tabs defaultValue="timeline" className="space-y-6">
        <TabsList>
          <TabsTrigger value="timeline" className="gap-1.5">
            <ShieldAlert className="h-4 w-4" /> Timeline
          </TabsTrigger>
          <TabsTrigger value="policy" className="gap-1.5">
            <Settings2 className="h-4 w-4" /> Policy
          </TabsTrigger>
          <TabsTrigger value="simulator" className="gap-1.5">
            <FlaskConical className="h-4 w-4" /> Simulatore
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-6">
          <div className="flex flex-wrap items-center gap-2 justify-end">
          <Select value={fromDays} onValueChange={setFromDays}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Ultimi 7 giorni</SelectItem>
              <SelectItem value="30">Ultimi 30 giorni</SelectItem>
              <SelectItem value="90">Ultimi 90 giorni</SelectItem>
            </SelectContent>
          </Select>
          <Select value={level} onValueChange={setLevel}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i livelli</SelectItem>
              <SelectItem value="1">Solo L1</SelectItem>
              <SelectItem value="2">Solo L2</SelectItem>
              <SelectItem value="3">Solo L3</SelectItem>
            </SelectContent>
          </Select>
          <Select value={outcomeFilter} onValueChange={setOutcomeFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli esiti</SelectItem>
              <SelectItem value="pending">In attesa</SelectItem>
              <SelectItem value="visto">Visto</SelectItem>
              <SelectItem value="risolto">Risolto</SelectItem>
              <SelectItem value="ignorato">Ignorato</SelectItem>
              <SelectItem value="no_manager">Senza manager</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <TimerReset className="h-4 w-4 mr-1" />
            Aggiorna
          </Button>
          </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Totale escalation" value={stats.total} />
        <KpiCard label="L1 / L2 / L3" value={`${stats.l1} · ${stats.l2} · ${stats.l3}`} />
        <KpiCard label="Risolti" value={stats.resolved} tone="success" />
        <KpiCard
          label="Critici"
          value={stats.ignored + stats.noManager}
          tone={stats.ignored + stats.noManager > 0 ? "danger" : "muted"}
        />
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline eventi</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              Nessuna escalation registrata nel periodo selezionato.
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <ol className="space-y-0">
                {filtered.map((row) => {
                  const meta = OUTCOME_META[row.outcome];
                  const OutcomeIcon = meta.icon;
                  return (
                    <li key={row.audit_id} className="flex gap-4">
                      <LevelDot level={row.escalation_level} />
                      <div className="flex-1 pb-5 min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="font-mono text-xs">
                                {LEVEL_LABEL[row.escalation_level] ?? `L${row.escalation_level}`}
                              </Badge>
                              {row.previous_level > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  da L{row.previous_level}
                                </span>
                              )}
                              <Badge variant={meta.variant} className="gap-1">
                                <OutcomeIcon className="h-3 w-3" />
                                {meta.label}
                              </Badge>
                            </div>
                            <Link
                              to={`/tickets?ticket=${row.ticket_id}`}
                              className="block mt-1 font-medium text-sm hover:underline truncate"
                            >
                              {row.ticket_title || `Ticket ${row.ticket_id.slice(0, 8)}`}
                              <ArrowUpRight className="inline h-3 w-3 ml-1 text-muted-foreground" />
                            </Link>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              SLA breach da{" "}
                              <strong className="text-foreground">{row.minutes_since_breach} min</strong>
                              {" · "}
                              {row.escalated_to_name ? (
                                <>notificato a <strong className="text-foreground">{row.escalated_to_name}</strong></>
                              ) : (
                                <span className="text-destructive">nessun manager destinatario</span>
                              )}
                            </p>
                            {row.notification_id && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                <Bell className="h-3 w-3 inline mr-1" />
                                Notifica inviata
                                {row.notification_read_at
                                  ? ` · letta ${formatDistanceToNow(new Date(row.notification_read_at), { locale: it, addSuffix: true })}`
                                  : " · non letta"}
                              </p>
                            )}
                            {row.suggestion_id && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                Action suggestion:{" "}
                                {row.suggestion_acted_on_at
                                  ? <span className="text-foreground">presa in carico</span>
                                  : row.suggestion_dismissed_at
                                  ? <span className="text-destructive">scartata</span>
                                  : "in attesa"}
                              </p>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatDistanceToNow(new Date(row.escalated_at), { locale: it, addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="policy">
          <TicketEscalationPolicyPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "success" | "danger" | "muted";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
      ? "text-destructive"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
