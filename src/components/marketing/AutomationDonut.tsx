import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Clock } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useQuery } from "@tanstack/react-query";

interface Props {
  fromIso: string;
  toIso: string;
}

interface AutomationCounts {
  succeeded: number;
  failed: number;
  pending: number;
  running: number;
}

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"];

export function AutomationDonut({ fromIso, toIso }: Props) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["automation-jobs-summary", brandId ?? "", fromIso, toIso],
    queryFn: async (): Promise<AutomationCounts> => {
      if (!brandId) return { succeeded: 0, failed: 0, pending: 0, running: 0 };
      const { data, error } = await supabase
        .from("automation_jobs")
        .select("status")
        .eq("brand_id", brandId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .limit(1000);
      if (error) throw error;
      const counts: AutomationCounts = { succeeded: 0, failed: 0, pending: 0, running: 0 };
      (data ?? []).forEach((r) => {
        const s = (r.status ?? "").toLowerCase();
        if (s === "succeeded" || s === "sent" || s === "completed") counts.succeeded++;
        else if (s === "failed" || s === "error" || s === "dlq") counts.failed++;
        else if (s === "pending" || s === "queued" || s === "scheduled") counts.pending++;
        else if (s === "running" || s === "processing") counts.running++;
        else counts.pending++;
      });
      return counts;
    },
    enabled: !!brandId && !!fromIso && !!toIso,
    staleTime: 60_000,
  });

  const chartData = [
    { name: "Riusciti", value: data?.succeeded ?? 0 },
    { name: "Falliti", value: data?.failed ?? 0 },
    { name: "In coda", value: data?.pending ?? 0 },
    { name: "In esecuzione", value: data?.running ?? 0 },
  ].filter((d) => d.value > 0);

  const total = chartData.reduce((a, b) => a + b.value, 0);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          Automation jobs
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[260px] w-full" />
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-10">
            Nessun job nel periodo.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={2}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v: number) => [`${v} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`, ""]}
                contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
