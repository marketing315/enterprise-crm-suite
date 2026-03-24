import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import type { Ga4DayStat } from "@/hooks/useGa4Stats";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

interface Ga4SourcesChartProps {
  stats: Ga4DayStat[];
  isLoading: boolean;
}

export function Ga4SourcesChart({ stats, isLoading }: Ga4SourcesChartProps) {
  // Aggregate sources across all days
  const sourceMap: Record<string, number> = {};
  for (const day of stats) {
    for (const src of day.top_sources || []) {
      const key = `${src.source} / ${src.medium}`;
      sourceMap[key] = (sourceMap[key] || 0) + src.sessions;
    }
  }

  const chartData = Object.entries(sourceMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Sorgenti Traffico</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Caricamento...
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nessun dato disponibile
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={100}
                innerRadius={50}
                dataKey="value"
                strokeWidth={2}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => value.toLocaleString("it-IT")}
                contentStyle={{
                  borderRadius: "8px",
                  border: "none",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
