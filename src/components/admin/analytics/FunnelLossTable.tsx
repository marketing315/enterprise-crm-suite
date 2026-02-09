import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelLosses } from "@/hooks/useFunnelMetrics";
import { AlertTriangle } from "lucide-react";

interface FunnelLossTableProps {
  data?: FunnelLosses;
  isLoading?: boolean;
}

const STAGE_COLORS: Record<string, string> = {
  "Lead senza chiamata": "hsl(45, 80%, 50%)",
  "Chiamati non risposti": "hsl(25, 80%, 55%)",
  "Risposti senza appuntamento": "hsl(270, 60%, 55%)",
  "Appuntamenti senza vendita": "hsl(0, 65%, 50%)",
  "Deal persi": "hsl(0, 80%, 45%)",
};

export function FunnelLossTable({ data, isLoading }: FunnelLossTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Contatti Persi</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const stages = data?.by_stage ?? [];
  const reasons = data?.by_reason ?? [];
  const maxStage = Math.max(...stages.map(s => s.count), 1);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Loss by stage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Perdite per Fase
          </CardTitle>
          <CardDescription>
            {data?.total_lost ?? 0} contatti persi nel periodo
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessuna perdita rilevata
            </p>
          ) : (
            <div className="space-y-3">
              {stages.filter(s => s.count > 0).map(stage => {
                const pct = maxStage > 0 ? (stage.count / maxStage) * 100 : 0;
                const color = STAGE_COLORS[stage.stage] || "hsl(var(--destructive))";
                return (
                  <div key={stage.stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span>{stage.stage}</span>
                      <span className="font-semibold tabular-nums">{stage.count}</span>
                    </div>
                    <div className="relative h-6 bg-muted/50 rounded overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded transition-all duration-500"
                        style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: color, opacity: 0.7 }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loss by reason */}
      <Card>
        <CardHeader>
          <CardTitle>Motivi Perdita</CardTitle>
          <CardDescription>
            Top motivi per deal persi
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reasons.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nessun motivo registrato
            </p>
          ) : (
            <div className="space-y-2">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                  <span className="truncate mr-2 break-words whitespace-pre-wrap max-w-[70%]">
                    {r.reason}
                  </span>
                  <span className="font-semibold tabular-nums text-destructive">{r.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
