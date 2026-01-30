import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VelocityMetrics, WeeklyTrend } from "@/hooks/useAdvancedAnalytics";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";

interface TrendComparisonChartProps {
  data?: VelocityMetrics;
  isLoading?: boolean;
}

export function TrendComparisonChart({ data, isLoading }: TrendComparisonChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Trend Settimanale</CardTitle>
          <CardDescription>Andamento deal nel periodo</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const weeklyTrend = data?.weekly_trend ?? [];

  const chartData = weeklyTrend.map((item) => ({
    week: format(parseISO(item.week_start), "d MMM", { locale: it }),
    creati: item.deals_created,
    vinti: item.deals_won,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trend Settimanale</CardTitle>
        <CardDescription>
          {data?.new_deals_count ?? 0} nuovi deal • {data?.deals_won_count ?? 0} vinti
        </CardDescription>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCreati" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorVinti" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="creati"
                  name="Deal Creati"
                  stroke="hsl(var(--primary))"
                  fillOpacity={1}
                  fill="url(#colorCreati)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="vinti"
                  name="Deal Vinti"
                  stroke="hsl(142, 71%, 45%)"
                  fillOpacity={1}
                  fill="url(#colorVinti)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato
          </div>
        )}

        {/* Velocity Stats */}
        <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xl font-bold">{data?.avg_days_to_win ?? 0}g</p>
            <p className="text-xs text-muted-foreground">Tempo medio a vittoria</p>
          </div>
          <div>
            <p className="text-xl font-bold">{data?.avg_days_to_lose ?? 0}g</p>
            <p className="text-xs text-muted-foreground">Tempo medio a perdita</p>
          </div>
          <div>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-500">{data?.deals_won_count ?? 0}</p>
            <p className="text-xs text-muted-foreground">Deal Vinti</p>
          </div>
          <div>
            <p className="text-xl font-bold text-destructive">{data?.deals_lost_count ?? 0}</p>
            <p className="text-xs text-muted-foreground">Deal Persi</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
