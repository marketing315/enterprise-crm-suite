import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { AdPlatformStatTrend } from "@/types/adPlatform";

interface AdStatsTrendChartProps {
  data: AdPlatformStatTrend[] | undefined;
  isLoading: boolean;
}

export function AdStatsTrendChart({ data, isLoading }: AdStatsTrendChartProps) {
  const chartData = data?.map((d) => ({
    date: format(parseISO(d.stat_date), "dd MMM", { locale: it }),
    spend: d.total_spend,
    clicks: d.total_clicks,
    reach: d.total_reach,
  })) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend Giornaliero</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--destructive))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--destructive))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradReach" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="date" 
                fontSize={12}
                tickMargin={8}
              />
              <YAxis 
                yAxisId="left"
                fontSize={12}
                tickFormatter={(v) => `€${v}`}
              />
              <YAxis 
                yAxisId="right"
                orientation="right"
                fontSize={12}
              />
              <Tooltip 
                formatter={(value: number, name: string) => {
                  if (name === "spend") return [`€${value.toFixed(2)}`, "Spesa"];
                  if (name === "reach") return [value.toLocaleString("it-IT"), "Reach"];
                  return [value, "Click"];
                }}
              />
              <Legend 
                formatter={(value) => {
                  if (value === "spend") return "Spesa (€)";
                  if (value === "reach") return "Reach";
                  return "Click";
                }}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                stroke="hsl(var(--destructive))"
                fill="url(#gradSpend)"
                strokeWidth={2}
              />
              <Area
                yAxisId="right"
                type="monotone"
                dataKey="reach"
                stroke="hsl(var(--primary))"
                fill="url(#gradReach)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
