import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
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
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
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
                formatter={(value: number, name: string) => [
                  name === "spend" ? `€${value.toFixed(2)}` : value,
                  name === "spend" ? "Spesa" : "Click"
                ]}
              />
              <Legend 
                formatter={(value) => value === "spend" ? "Spesa (€)" : "Click"}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="spend"
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="clicks"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
