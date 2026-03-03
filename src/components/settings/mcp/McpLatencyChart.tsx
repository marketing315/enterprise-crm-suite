import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { BarChart3 } from "lucide-react";
import { useMcpExecutions, type McpExecution } from "@/hooks/useMcpData";

export function McpLatencyChart() {
  const { data: executions = [] } = useMcpExecutions(100);

  const chartData = useMemo(() => {
    // Group by tool, compute avg latency
    const byTool = new Map<string, { total: number; count: number; failed: number }>();

    executions.forEach((e) => {
      const name = e.tool_name || e.resource_uri || "unknown";
      const existing = byTool.get(name) || { total: 0, count: 0, failed: 0 };
      existing.count++;
      if (e.latency_ms) existing.total += e.latency_ms;
      if (["failed", "timeout", "failed_transient"].includes(e.status)) existing.failed++;
      byTool.set(name, existing);
    });

    return Array.from(byTool.entries())
      .map(([name, stats]) => ({
        name: name.length > 20 ? name.slice(0, 18) + "…" : name,
        avgLatency: Math.round(stats.total / (stats.count || 1)),
        count: stats.count,
        errorRate: Math.round((stats.failed / stats.count) * 100),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [executions]);

  if (chartData.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4" /> Latenza media per tool (top 10)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis type="number" tick={{ fontSize: 11 }} unit="ms" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={120} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="rounded-md border bg-background p-2 shadow-sm text-xs space-y-1">
                    <p className="font-medium">{d.name}</p>
                    <p>Avg latency: <span className="font-mono">{d.avgLatency}ms</span></p>
                    <p>Executions: {d.count}</p>
                    <p>Error rate: <span className={d.errorRate > 5 ? "text-destructive" : ""}>{d.errorRate}%</span></p>
                  </div>
                );
              }}
            />
            <Bar dataKey="avgLatency" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell
                  key={i}
                  className={entry.avgLatency > 1000 ? "fill-destructive" : entry.avgLatency > 500 ? "fill-yellow-500" : "fill-primary"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
