import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { FlaskConical, Play, ArrowRight, Info } from "lucide-react";

type Counts = { level_0: number; level_1: number; level_2: number; level_3: number };

interface SimulationResult {
  simulated: Counts;
  actual: Counts;
  total_tickets: number;
  avg_minutes_after_breach: number;
  thresholds: {
    level_1_minutes: number;
    level_2_minutes: number;
    level_3_minutes: number;
  };
  from_days: number;
  brand_id: string;
  computed_at: string;
}

function Delta({ before, after }: { before: number; after: number }) {
  const diff = after - before;
  if (diff === 0) return <span className="text-muted-foreground text-xs">=</span>;
  const positive = diff > 0;
  return (
    <span className={`text-xs font-medium ${positive ? "text-orange-600" : "text-emerald-600"}`}>
      {positive ? "+" : ""}
      {diff}
    </span>
  );
}

export function TicketEscalationSimulator() {
  const { currentBrand } = useBrand();
  const selectedBrandId = currentBrand?.id ?? null;
  const [l1, setL1] = useState(30);
  const [l2, setL2] = useState(120);
  const [l3, setL3] = useState(480);
  const [fromDays, setFromDays] = useState("30");
  const [result, setResult] = useState<SimulationResult | null>(null);

  const simulate = useMutation({
    mutationFn: async () => {
      if (!selectedBrandId) throw new Error("Nessun brand selezionato");
      if (l1 <= 0 || l2 <= 0 || l3 <= 0) throw new Error("Le soglie devono essere positive");
      if (!(l1 < l2 && l2 < l3)) throw new Error("Le soglie devono essere crescenti (L1 < L2 < L3)");

      const { data, error } = await supabase.rpc("simulate_ticket_escalation_policy" as never, {
        p_brand_id: selectedBrandId,
        p_level_1_minutes: l1,
        p_level_2_minutes: l2,
        p_level_3_minutes: l3,
        p_from_days: Number(fromDays),
      } as never);

      if (error) throw error;
      return data as unknown as SimulationResult;
    },
    onSuccess: (data) => setResult(data),
    onError: (err: Error) =>
      toast({
        title: "Simulazione fallita",
        description: err.message,
        variant: "destructive",
      }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Parametri simulazione
          </CardTitle>
          <CardDescription>
            Verifica l'impatto di soglie alternative sui ticket con SLA scaduto del periodo selezionato.
            Nessuna modifica viene salvata: è solo un calcolo what-if.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sim-l1" className="text-xs">L1 (minuti)</Label>
              <Input
                id="sim-l1"
                type="number"
                min={1}
                value={l1}
                onChange={(e) => setL1(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-l2" className="text-xs">L2 (minuti)</Label>
              <Input
                id="sim-l2"
                type="number"
                min={1}
                value={l2}
                onChange={(e) => setL2(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sim-l3" className="text-xs">L3 (minuti)</Label>
              <Input
                id="sim-l3"
                type="number"
                min={1}
                value={l3}
                onChange={(e) => setL3(Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Periodo storico</Label>
              <Select value={fromDays} onValueChange={setFromDays}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Ultimi 7 giorni</SelectItem>
                  <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="60">Ultimi 60 giorni</SelectItem>
                  <SelectItem value="90">Ultimi 90 giorni</SelectItem>
                  <SelectItem value="180">Ultimi 180 giorni</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            Vengono considerati solo ticket non archiviati con <code className="font-mono">sla_breached_at</code> nel periodo.
          </div>

          <Button
            onClick={() => simulate.mutate()}
            disabled={simulate.isPending || !selectedBrandId}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            {simulate.isPending ? "Calcolo in corso..." : "Esegui simulazione"}
          </Button>
        </CardContent>
      </Card>

      {simulate.isPending && (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {result && !simulate.isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Risultato simulazione</CardTitle>
            <CardDescription>
              {result.total_tickets} ticket analizzati su {result.from_days} giorni · tempo medio post-breach{" "}
              <strong>{result.avg_minutes_after_breach} min</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {(["level_0", "level_1", "level_2", "level_3"] as const).map((key) => {
                const label =
                  key === "level_0" ? "Nessuna escalation" :
                  key === "level_1" ? "L1" :
                  key === "level_2" ? "L2" : "L3";
                const before = result.actual[key];
                const after = result.simulated[key];
                return (
                  <div key={key} className="rounded-lg border p-3 bg-card">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
                    <div className="flex items-baseline gap-2 mt-2">
                      <span className="text-sm text-muted-foreground line-through">{before}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-2xl font-semibold text-foreground">{after}</span>
                      <Delta before={before} after={after} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Badge variant="outline" className="font-mono text-xs">
                L1 {result.thresholds.level_1_minutes}'
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                L2 {result.thresholds.level_2_minutes}'
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                L3 {result.thresholds.level_3_minutes}'
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              <strong>Lettura:</strong> i numeri "prima" sono le escalation realmente avvenute con la policy attiva;
              i numeri "dopo" sono quelle che si sarebbero attivate con queste nuove soglie. Un numero in arancione
              significa <em>più</em> escalation a quel livello, in verde <em>meno</em>.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
