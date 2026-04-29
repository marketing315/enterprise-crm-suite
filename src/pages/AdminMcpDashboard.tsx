import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, AlertTriangle, ShieldOff, Zap, Clock, Users, KeyRound, BarChart3 } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useMcpServerKpi,
  useMcpActiveTokens,
  useMcpRequestLog,
  useToggleMcpKillSwitch,
} from "@/hooks/useMcpServerKpi";
import { toast } from "@/hooks/use-toast";

export default function AdminMcpDashboard() {
  const [window, setWindow] = useState<number>(24);
  const { data: kpi, isLoading: kpiLoading } = useMcpServerKpi(window);
  const { data: tokens = [], isLoading: tokensLoading } = useMcpActiveTokens();
  const { data: logs = [], isLoading: logsLoading } = useMcpRequestLog(100);
  const toggleKill = useToggleMcpKillSwitch();

  const handleKillSwitch = async (enabled: boolean) => {
    try {
      await toggleKill.mutateAsync(enabled);
      toast({
        title: enabled ? "Server MCP disattivato" : "Server MCP riattivato",
        description: enabled
          ? "Tutte le richieste in arrivo verranno rifiutate con HTTP 503."
          : "Il server è di nuovo operativo.",
        variant: enabled ? "destructive" : "default",
      });
    } catch (e) {
      toast({ title: "Errore", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">MCP Server</h1>
          <p className="text-muted-foreground">
            Observability, rate limiting e controllo operativo del server MCP esterno.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
            {(["1", "6", "24", "168"] as const).map((h) => (
              <button
                key={h}
                onClick={() => setWindow(Number(h))}
                className={`text-xs px-2 py-1 rounded transition ${
                  window === Number(h)
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h === "168" ? "7g" : `${h}h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Kill switch */}
      <Card className={kpi?.kill_switch_active ? "border-destructive" : ""}>
        <CardContent className="pt-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldOff className={`h-6 w-6 ${kpi?.kill_switch_active ? "text-destructive" : "text-muted-foreground"}`} />
            <div>
              <p className="font-medium">Kill-switch globale</p>
              <p className="text-sm text-muted-foreground">
                {kpi?.kill_switch_active
                  ? "Il server MCP è disattivato. Tutte le richieste vengono rifiutate."
                  : "Disattiva il server in caso di emergenza (HTTP 503 a tutti i client)."}
              </p>
            </div>
          </div>
          <Switch
            checked={!!kpi?.kill_switch_active}
            onCheckedChange={handleKillSwitch}
            disabled={toggleKill.isPending}
          />
        </CardContent>
      </Card>

      {/* KPI grid */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={<BarChart3 className="h-4 w-4" />} label="Richieste" value={kpi?.total_requests ?? 0} loading={kpiLoading} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Errori" value={kpi?.error_count ?? 0} loading={kpiLoading} />
        <KpiCard icon={<ShieldOff className="h-4 w-4 text-amber-500" />} label="Auth fail" value={kpi?.auth_failures ?? 0} loading={kpiLoading} />
        <KpiCard icon={<Zap className="h-4 w-4" />} label="Error rate" value={`${kpi?.error_rate ?? 0}%`} loading={kpiLoading} />
        <KpiCard icon={<Clock className="h-4 w-4" />} label="Latenza p95" value={`${kpi?.latency_p95_ms ?? 0}ms`} loading={kpiLoading} />
        <KpiCard icon={<KeyRound className="h-4 w-4" />} label="Token attivi" value={kpi?.active_tokens ?? 0} loading={kpiLoading} />
      </div>

      <Tabs defaultValue="tools" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tools" className="gap-1.5"><Activity className="h-4 w-4" /> Top tools</TabsTrigger>
          <TabsTrigger value="errors" className="gap-1.5"><AlertTriangle className="h-4 w-4" /> Errori</TabsTrigger>
          <TabsTrigger value="tokens" className="gap-1.5"><Users className="h-4 w-4" /> Token</TabsTrigger>
          <TabsTrigger value="log" className="gap-1.5"><BarChart3 className="h-4 w-4" /> Request log</TabsTrigger>
        </TabsList>

        {/* TOP TOOLS */}
        <TabsContent value="tools">
          <Card>
            <CardHeader>
              <CardTitle>Tool più chiamati</CardTitle>
              <CardDescription>Ultime {window}h — ordinati per volume.</CardDescription>
            </CardHeader>
            <CardContent>
              {kpiLoading ? <Skeleton className="h-40 w-full" /> : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tool</TableHead>
                      <TableHead className="text-right">Chiamate</TableHead>
                      <TableHead className="text-right">Errori</TableHead>
                      <TableHead className="text-right">p95 (ms)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(kpi?.top_tools ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nessuna chiamata nel periodo</TableCell></TableRow>
                    )}
                    {(kpi?.top_tools ?? []).map((t) => (
                      <TableRow key={t.name}>
                        <TableCell className="font-mono text-xs">{t.name}</TableCell>
                        <TableCell className="text-right">{t.calls}</TableCell>
                        <TableCell className="text-right">
                          {t.errors > 0 ? <Badge variant="destructive">{t.errors}</Badge> : t.errors}
                        </TableCell>
                        <TableCell className="text-right font-mono">{t.p95_ms}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ERRORS */}
        <TabsContent value="errors">
          <Card>
            <CardHeader>
              <CardTitle>Errori per tipo</CardTitle>
              <CardDescription>Distribuzione degli errori nelle ultime {window}h.</CardDescription>
            </CardHeader>
            <CardContent>
              {kpiLoading ? <Skeleton className="h-40 w-full" /> : (
                <div className="space-y-2">
                  {(kpi?.top_errors ?? []).length === 0 && (
                    <p className="text-center text-muted-foreground py-6">Nessun errore 🎉</p>
                  )}
                  {(kpi?.top_errors ?? []).map((e) => (
                    <div key={e.code} className="flex items-center justify-between rounded-md border p-3">
                      <Badge variant="destructive" className="font-mono">{e.code}</Badge>
                      <span className="text-sm font-medium">{e.occurrences} occorrenze</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TOKENS */}
        <TabsContent value="tokens">
          <Card>
            <CardHeader>
              <CardTitle>Token attivi</CardTitle>
              <CardDescription>Stato e utilizzo nelle ultime 24h. Massimo 200 risultati.</CardDescription>
            </CardHeader>
            <CardContent>
              {tokensLoading ? <Skeleton className="h-40 w-full" /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Scopes</TableHead>
                        <TableHead className="text-right">Rate / min</TableHead>
                        <TableHead className="text-right">Req 24h</TableHead>
                        <TableHead className="text-right">Errori 24h</TableHead>
                        <TableHead className="text-right">Avg ms</TableHead>
                        <TableHead>Ultimo uso</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {tokens.length === 0 && (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-6">Nessun token attivo</TableCell></TableRow>
                      )}
                      {tokens.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-medium">{t.name}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{t.kind}</Badge></TableCell>
                          <TableCell className="max-w-[240px]">
                            <div className="flex flex-wrap gap-1">
                              {t.scopes.slice(0, 3).map((s) => <Badge key={s} variant="secondary" className="text-[10px] font-mono">{s}</Badge>)}
                              {t.scopes.length > 3 && <span className="text-xs text-muted-foreground">+{t.scopes.length - 3}</span>}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">{t.rate_limit_per_min}</TableCell>
                          <TableCell className="text-right">{t.requests_24h}</TableCell>
                          <TableCell className="text-right">
                            {t.errors_24h > 0 ? <Badge variant="destructive">{t.errors_24h}</Badge> : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">{t.avg_latency_ms}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {t.last_used_at ? format(new Date(t.last_used_at), "dd/MM HH:mm", { locale: it }) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* REQUEST LOG */}
        <TabsContent value="log">
          <Card>
            <CardHeader>
              <CardTitle>Request log</CardTitle>
              <CardDescription>Ultime 100 chiamate al server MCP.</CardDescription>
            </CardHeader>
            <CardContent>
              {logsLoading ? <Skeleton className="h-64 w-full" /> : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Tool</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead>Errore</TableHead>
                        <TableHead className="text-right">Latenza</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l: any) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {format(new Date(l.created_at), "dd/MM HH:mm:ss", { locale: it })}
                          </TableCell>
                          <TableCell className="font-mono text-xs">{l.method}</TableCell>
                          <TableCell className="font-mono text-xs">{l.tool_name ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant={l.status_code >= 400 ? "destructive" : "default"} className="text-xs">
                              {l.status_code}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-destructive">{l.error_code ?? "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{l.duration_ms}ms</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: string | number; loading: boolean }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon} {label}
        </div>
        {loading ? <Skeleton className="h-7 w-16" /> : <div className="text-2xl font-bold">{value}</div>}
      </CardContent>
    </Card>
  );
}
