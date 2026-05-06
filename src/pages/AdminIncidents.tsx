import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { MetricCard } from "@/components/admin/MetricCard";
import { AlertTriangle, Bug, Activity, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface IncidentRow {
  id: string;
  error_id: string;
  user_id: string | null;
  route: string | null;
  boundary_label: string | null;
  message: string | null;
  stack_digest: string | null;
  user_agent: string | null;
  build_version: string | null;
  created_at: string;
}

function useClientIncidents(limit = 200) {
  return useQuery({
    queryKey: ["admin", "client-incidents", limit],
    queryFn: async (): Promise<IncidentRow[]> => {
      const { data, error } = await supabase
        .from("client_incidents" as never)
        .select("id, error_id, user_id, route, boundary_label, message, stack_digest, user_agent, build_version, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as IncidentRow[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export default function AdminIncidents() {
  const { data: incidents = [], isLoading, error } = useClientIncidents(200);

  const stats = useMemo(() => {
    const cutoff24h = Date.now() - 86_400_000;
    const recent = incidents.filter(i => new Date(i.created_at).getTime() > cutoff24h);
    const uniqueUsers = new Set(recent.map(i => i.user_id).filter(Boolean)).size;
    const byRoute = new Map<string, number>();
    for (const i of recent) {
      const k = i.route ?? "—";
      byRoute.set(k, (byRoute.get(k) ?? 0) + 1);
    }
    const topRoutes = [...byRoute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { total: incidents.length, recent24h: recent.length, uniqueUsers, topRoutes };
  }, [incidents]);

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Bug className="h-7 w-7 text-primary" />
          Incidenti frontend
        </h1>
        <p className="text-muted-foreground">
          F6 — errori catturati dagli ErrorBoundary in produzione, con dedup e rate-limit lato server.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore caricamento</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Incidenti 24h" value={stats.recent24h} icon={Activity} variant={stats.recent24h > 20 ? "danger" : stats.recent24h > 5 ? "warning" : "success"} />
        <MetricCard title="Utenti impattati" value={stats.uniqueUsers} icon={Users} subtitle="ultime 24h" />
        <MetricCard title="Totale tracciati" value={stats.total} icon={Bug} subtitle={`mostrati ultimi ${incidents.length}`} />
      </div>

      {stats.topRoutes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Route con più errori (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {stats.topRoutes.map(([route, count]) => (
                <li key={route} className="flex justify-between">
                  <code className="text-xs">{route}</code>
                  <Badge variant={count > 5 ? "destructive" : "secondary"}>{count}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Incidenti recenti</CardTitle>
          <CardDescription>Ordinati per data, max 200 record.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Caricamento…</div>
          ) : incidents.length === 0 ? (
            <div className="text-sm text-muted-foreground">Nessun incidente registrato.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Boundary</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead>Messaggio</TableHead>
                  <TableHead>Build</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="text-xs">
                      {formatDistanceToNow(new Date(i.created_at), { addSuffix: true, locale: it })}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{i.error_id}</TableCell>
                    <TableCell className="text-xs">{i.boundary_label ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{i.route ?? "—"}</TableCell>
                    <TableCell className="text-xs max-w-md truncate" title={i.message ?? ""}>
                      {i.message ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{i.build_version ?? "—"}</TableCell>
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
