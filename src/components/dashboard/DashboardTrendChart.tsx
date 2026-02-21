import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, ComposedChart } from "recharts";

interface TrendDataPoint {
  date: string;
  label: string;
  leads: number;
  tickets: number;
  cpl?: number | null;
}

interface DashboardTrendChartProps {
  data: TrendDataPoint[];
  isLoading?: boolean;
}

const CplTooltipFormatter = (value: number, name: string) => {
  if (name === "CPL") return [`€${value.toFixed(2)}`, name];
  return [value, name];
};

export function DashboardTrendChart({ data, isLoading }: DashboardTrendChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[200px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const hasCpl = data.some(d => d.cpl != null && d.cpl > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Andamento 7 Giorni</CardTitle>
        <CardDescription>Lead, ticket e CPL giornaliero</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[200px] md:h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 5, right: hasCpl ? 10 : 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="ticketGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis 
                yAxisId="left"
                tick={{ fontSize: 11 }} 
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              {hasCpl && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `€${v}`}
                  className="text-muted-foreground"
                />
              )}
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                labelStyle={{ color: "hsl(var(--foreground))" }}
                formatter={CplTooltipFormatter}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="leads"
                name="Lead"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#leadGradient)"
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="tickets"
                name="Ticket"
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                fill="url(#ticketGradient)"
              />
              {hasCpl && (
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cpl"
                  name="CPL"
                  stroke="hsl(var(--chart-4, 43 74% 66%))"
                  strokeWidth={2}
                  strokeDasharray="5 3"
                  dot={{ r: 3, fill: "hsl(var(--chart-4, 43 74% 66%))" }}
                  connectNulls
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
