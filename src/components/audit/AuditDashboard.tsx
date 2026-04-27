import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { Activity, Users, TrendingUp, Layers, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuditDashboardStats } from "@/hooks/useAuditDashboard";
import { AuditActionTag } from "./AuditActionTag";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const RANGE_OPTIONS = [
  { value: "7", label: "Ultimi 7 giorni" },
  { value: "30", label: "Ultimi 30 giorni" },
  { value: "90", label: "Ultimi 90 giorni" },
];

const entityLabels: Record<string, string> = {
  contact: "Contatti",
  deal: "Deal",
  ticket: "Ticket",
  appointment: "Appuntamenti",
  tag_assignment: "Tag",
  custom_field: "Campi personalizzati",
};

export function AuditDashboard() {
  const [range, setRange] = useState("30");

  const { dateFrom, dateTo } = useMemo(() => {
    const days = parseInt(range, 10);
    return { dateFrom: subDays(new Date(), days), dateTo: new Date() };
  }, [range]);

  const { data, isLoading } = useAuditDashboardStats(dateFrom, dateTo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = data ?? {
    total: 0,
    by_action: [],
    by_entity: [],
    by_actor: [],
    by_day: [],
  };

  const topActor = stats.by_actor[0];
  const topAction = stats.by_action[0];
  const distinctActors = stats.by_actor.length;

  const chartData = stats.by_day.map(d => ({
    day: format(new Date(d.day), "dd MMM", { locale: it }),
    eventi: d.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Dashboard Management</h2>
          <p className="text-sm text-muted-foreground">
            Volumi e distribuzione delle attività tracciate
          </p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Activity}
          label="Eventi totali"
          value={stats.total.toLocaleString("it-IT")}
          hint="nel periodo"
        />
        <KpiCard
          icon={Users}
          label="Attori unici"
          value={distinctActors.toString()}
          hint="utenti che hanno generato eventi"
        />
        <KpiCard
          icon={TrendingUp}
          label="Attore più attivo"
          value={topActor?.actor_display_name || "—"}
          hint={topActor ? `${topActor.count.toLocaleString("it-IT")} eventi` : ""}
        />
        <KpiCard
          icon={Layers}
          label="Azione più frequente"
          value={topAction?.action || "—"}
          hint={topAction ? `${topAction.count.toLocaleString("it-IT")} eventi` : ""}
        />
      </div>

      {/* Trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trend giornaliero</CardTitle>
          <CardDescription>Eventi registrati per giorno</CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nessun dato</p>
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Line type="monotone" dataKey="eventi" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top actors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top utenti</CardTitle>
            <CardDescription>Per numero di azioni</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.by_actor.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun dato</p>
            ) : (
              stats.by_actor.slice(0, 10).map(a => (
                <div key={a.actor_user_id} className="flex items-center justify-between text-sm">
                  <span className="truncate">{a.actor_display_name || "Sconosciuto"}</span>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    {a.count.toLocaleString("it-IT")}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By action */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per tipo di azione</CardTitle>
            <CardDescription>Distribuzione eventi</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.by_action.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun dato</p>
            ) : (
              stats.by_action.map(a => (
                <div key={a.action} className="flex items-center justify-between text-sm">
                  <AuditActionTag action={a.action} />
                  <span className="text-muted-foreground text-xs ml-2">
                    {a.count.toLocaleString("it-IT")}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* By entity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Per entità</CardTitle>
            <CardDescription>Su cosa si interviene</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {stats.by_entity.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun dato</p>
            ) : (
              stats.by_entity.map(e => (
                <div key={e.entity_type} className="flex items-center justify-between text-sm">
                  <span>{entityLabels[e.entity_type] || e.entity_type}</span>
                  <Badge variant="outline" className="ml-2 shrink-0">
                    {e.count.toLocaleString("it-IT")}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-semibold mt-1 truncate">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </div>
          <div className="rounded-md bg-primary/10 p-2 text-primary shrink-0 ml-2">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
