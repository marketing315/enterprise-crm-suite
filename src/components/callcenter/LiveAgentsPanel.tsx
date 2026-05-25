/**
 * F6 — Pannello live agenti + code (Realtime VoiSpeed).
 * Mostra stato operatori e KPI code in tempo reale.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Clock, Users, AlertTriangle } from "lucide-react";
import { useVoispeedAgents, useVoispeedQueueLatest, type AgentStatus } from "@/hooks/useVoispeedLive";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { it } from "date-fns/locale";

const STATUS_META: Record<AgentStatus, { label: string; cls: string }> = {
  available: { label: "Disp.", cls: "bg-emerald-500/15 text-emerald-700 border-emerald-300 dark:text-emerald-300" },
  on_call:   { label: "In chiamata", cls: "bg-blue-500/15 text-blue-700 border-blue-300 dark:text-blue-300" },
  ringing:   { label: "Squilla", cls: "bg-amber-500/15 text-amber-700 border-amber-300 dark:text-amber-300" },
  wrap_up:   { label: "Wrap-up", cls: "bg-violet-500/15 text-violet-700 border-violet-300 dark:text-violet-300" },
  paused:    { label: "In pausa", cls: "bg-orange-500/15 text-orange-700 border-orange-300 dark:text-orange-300" },
  dnd:       { label: "DND",     cls: "bg-rose-500/15 text-rose-700 border-rose-300 dark:text-rose-300" },
  offline:   { label: "Offline", cls: "bg-muted text-muted-foreground border-border" },
};

export function LiveAgentsPanel({ brandId }: { brandId: string }) {
  const agentsQ = useVoispeedAgents(brandId);
  const queueQ = useVoispeedQueueLatest(brandId);

  const agents = agentsQ.data ?? [];
  const queues = queueQ.data ?? [];
  const counts = agents.reduce<Record<AgentStatus, number>>(
    (acc, a) => { acc[a.status] = (acc[a.status] ?? 0) + 1; return acc; },
    { available: 0, on_call: 0, ringing: 0, wrap_up: 0, paused: 0, dnd: 0, offline: 0 },
  );

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Agenti */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> Agenti live · VoiSpeed
          </CardTitle>
          <Badge variant="outline" className="gap-1">
            <Activity className={cn("w-3 h-3", agentsQ.connected ? "text-emerald-500" : "text-muted-foreground")} />
            {agentsQ.connected ? "Realtime" : "Polling"}
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {(["available","on_call","ringing","paused"] as AgentStatus[]).map((s) => (
              <div key={s} className="rounded-md border p-2 text-center">
                <div className="text-xs text-muted-foreground">{STATUS_META[s].label}</div>
                <div className="text-xl font-semibold tabular-nums">{counts[s]}</div>
              </div>
            ))}
          </div>
          {agents.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nessun agente sincronizzato. La pipeline VoiSpeed scrive su <code>voispeed_agent_status</code>.
            </div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-auto">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs border", STATUS_META[a.status].cls)}>
                      {STATUS_META[a.status].label}
                    </span>
                    <span className="font-medium">Ext {a.voispeed_ext}</span>
                    {a.queue_name && <Badge variant="secondary" className="text-xs">{a.queue_name}</Badge>}
                  </div>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatDistanceToNowStrict(new Date(a.since), { locale: it, addSuffix: false })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Code */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" /> Code · ultimo snapshot
          </CardTitle>
        </CardHeader>
        <CardContent>
          {queues.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Nessun dato di coda disponibile.</div>
          ) : (
            <div className="space-y-2">
              {queues.map((q) => {
                const warn = (q.calls_waiting ?? 0) > 0 || (q.longest_wait_seconds ?? 0) > 60;
                return (
                  <div key={q.id} className={cn("rounded-md border p-3", warn && "border-amber-400/60 bg-amber-50/40 dark:bg-amber-900/10")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{q.queue_name}</span>
                      {warn && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <Stat label="In attesa" value={q.calls_waiting} />
                      <Stat label="Attesa max" value={`${q.longest_wait_seconds ?? 0}s`} />
                      <Stat label="Disp." value={q.agents_available} />
                      <Stat label="SL %" value={q.service_level_pct != null ? `${q.service_level_pct}%` : "—"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="text-sm font-medium tabular-nums">{value ?? "—"}</div>
    </div>
  );
}
