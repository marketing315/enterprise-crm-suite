import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Loader2, RefreshCw, Activity } from "lucide-react";

interface DqRow {
  id: string;
  brand_id: string;
  entity: string;
  metric: string;
  value: number;
  total: number;
  bad: number;
  computed_at: string;
}

const METRIC_LABELS: Record<string, string> = {
  phone_missing_or_invalid: "Telefono mancante o non valido",
  email_missing: "Email mancante",
  stage_missing: "Deal senza stage",
  value_missing: "Deal senza valore",
  past_no_outcome: "Appuntamenti scaduti senza esito",
  contact_missing: "Lead senza contatto",
};

export default function AdminDataQuality() {
  const { currentBrand } = useBrandFilter();
  const brandId = currentBrand?.id;
  const qc = useQueryClient();

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["data-quality", brandId],
    enabled: !!brandId,
    queryFn: async (): Promise<DqRow[]> => {
      const { data, error } = await supabase
        .from("data_quality_metrics" as never)
        .select("*")
        .eq("brand_id", brandId as string)
        .order("computed_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data as unknown as DqRow[]) ?? [];
    },
  });

  const compute = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("compute_data_quality" as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Metriche aggiornate");
      qc.invalidateQueries({ queryKey: ["data-quality", brandId] });
    },
    onError: (e: Error) => toast.error(e.message || "Errore calcolo metriche"),
  });

  // Pick latest row per (entity, metric)
  const latest = useMemo(() => {
    const map = new Map<string, DqRow>();
    (data ?? []).forEach((r) => {
      const key = `${r.entity}::${r.metric}`;
      if (!map.has(key)) map.set(key, r);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.entity === b.entity ? a.metric.localeCompare(b.metric) : a.entity.localeCompare(b.entity),
    );
  }, [data]);

  const grouped = useMemo(() => {
    const g: Record<string, DqRow[]> = {};
    latest.forEach((r) => {
      g[r.entity] = g[r.entity] ?? [];
      g[r.entity].push(r);
    });
    return g;
  }, [latest]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Activity className="h-7 w-7 text-primary" />
            Data Quality
          </h1>
          <p className="text-muted-foreground mt-1">
            Punteggi di qualità dei dati per il brand corrente. Più alto è il valore, più record sono problematici.
          </p>
        </div>
        <Button onClick={() => compute.mutate()} disabled={compute.isPending}>
          {compute.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Ricalcola ora
        </Button>
      </div>

      {isLoading || isFetching ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : latest.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nessuna metrica ancora calcolata. Premi <strong>Ricalcola ora</strong> per generare la prima snapshot.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {Object.entries(grouped).map(([entity, rows]) => (
            <Card key={entity}>
              <CardHeader>
                <CardTitle className="capitalize">{entity}</CardTitle>
                <CardDescription>
                  Aggiornato: {new Date(rows[0].computed_at).toLocaleString("it-IT")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {rows.map((r) => {
                  const severity = r.value >= 50 ? "destructive" : r.value >= 20 ? "default" : "secondary";
                  return (
                    <div key={r.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{METRIC_LABELS[r.metric] ?? r.metric}</span>
                        <Badge variant={severity}>{r.value}%</Badge>
                      </div>
                      <Progress value={Number(r.value)} />
                      <p className="text-xs text-muted-foreground">
                        {r.bad} su {r.total} record
                      </p>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
