import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { untypedClient } from "@/integrations/supabase/untypedClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Gauge, RefreshCw, Trash2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { toast } from "@/hooks/use-toast";

interface SlowQuery {
  query: string;
  calls: number;
  total_exec_ms: number;
  mean_exec_ms: number;
  max_exec_ms: number;
  rows_returned: number;
  shared_blks_hit: number;
  shared_blks_read: number;
}

export default function AdminSlowQueries() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-slow-queries"],
    queryFn: async (): Promise<SlowQuery[]> => {
      const { data, error } = await untypedClient.rpc("get_slow_queries", { p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as SlowQuery[];
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { error } = await untypedClient.rpc("reset_slow_queries");
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Statistiche azzerate" });
      qc.invalidateQueries({ queryKey: ["admin-slow-queries"] });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const rows = (data ?? []).filter((r) =>
    !filter || r.query.toLowerCase().includes(filter.toLowerCase()),
  );

  const fmt = (n: number) => n.toFixed(2);
  const sevBadge = (mean: number) => {
    if (mean >= 500) return <Badge variant="destructive">{fmt(mean)} ms</Badge>;
    if (mean >= 100) return <Badge className="bg-orange-500">{fmt(mean)} ms</Badge>;
    if (mean >= 25) return <Badge className="bg-yellow-500">{fmt(mean)} ms</Badge>;
    return <Badge variant="secondary">{fmt(mean)} ms</Badge>;
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Gauge className="w-7 h-7 text-primary" />
            Slow Queries
          </h1>
          <p className="text-muted-foreground">
            Top 100 query per tempo medio di esecuzione (<code>pg_stat_statements</code>).
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (confirm("Azzerare le statistiche pg_stat_statements?")) reset.mutate();
            }}
            disabled={reset.isPending}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Query monitor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Filtra per testo query…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md"
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Query</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Mean</TableHead>
                <TableHead className="text-right">Max</TableHead>
                <TableHead className="text-right">Total (s)</TableHead>
                <TableHead className="text-right">Rows</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Caricamento…</TableCell></TableRow>
              )}
              {!isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">
                  Nessuna query registrata.
                </TableCell></TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <pre className="text-xs whitespace-pre-wrap break-all max-h-32 overflow-auto font-mono">
                      {r.query}
                    </pre>
                  </TableCell>
                  <TableCell className="text-right">{r.calls.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{sevBadge(r.mean_exec_ms)}</TableCell>
                  <TableCell className="text-right text-xs">{fmt(r.max_exec_ms)} ms</TableCell>
                  <TableCell className="text-right text-xs">{(r.total_exec_ms / 1000).toFixed(1)}</TableCell>
                  <TableCell className="text-right text-xs">{r.rows_returned.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
