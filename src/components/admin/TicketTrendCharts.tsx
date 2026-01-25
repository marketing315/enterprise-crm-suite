import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { TicketTrendDashboard } from "@/hooks/useTicketTrend";

interface TicketTrendChartsProps {
  data: TicketTrendDashboard;
}

const AGING_COLORS = {
  bucket_0_1h: "hsl(var(--chart-3))",
  bucket_1_4h: "hsl(var(--chart-2))",
  bucket_4_24h: "hsl(var(--chart-5))",
  bucket_over_24h: "hsl(var(--destructive))",
};

const AGING_LABELS: Record<string, string> = {
  bucket_0_1h: "0-1h",
  bucket_1_4h: "1-4h",
  bucket_4_24h: "4-24h",
  bucket_over_24h: ">24h",
};

export function TicketTrendCharts({ data }: TicketTrendChartsProps) {
  // Format daily trend data
  const trendData = data.daily_trend.map((day) => ({
    ...day,
    dateLabel: format(new Date(day.date), "dd/MM", { locale: it }),
  }));

  // Format backlog trend data
  const backlogData = data.backlog_trend.map((day) => ({
    ...day,
    dateLabel: format(new Date(day.date), "dd/MM", { locale: it }),
  }));

  // Format aging buckets for pie chart
  const agingData = Object.entries(data.aging_buckets)
    .filter(([_, value]) => value > 0)
    .map(([key, value]) => ({
      name: AGING_LABELS[key] || key,
      value,
      color: AGING_COLORS[key as keyof typeof AGING_COLORS] || "hsl(var(--muted))",
    }));

  const totalAging = Object.values(data.aging_buckets).reduce((a, b) => a + b, 0);

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Daily Trend Chart */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Trend Giornaliero</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Nessun dato nel periodo selezionato
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  labelStyle={{ color: "hsl(var(--popover-foreground))" }}
                />
                <Line
                  type="monotone"
                  dataKey="created"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  name="Creati"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="resolved"
                  stroke="hsl(var(--chart-3))"
                  strokeWidth={2}
                  name="Risolti"
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="closed"
                  stroke="hsl(var(--chart-4))"
                  strokeWidth={2}
                  name="Chiusi"
                  dot={false}
                />
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Aging Buckets Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aging Ticket Aperti</CardTitle>
        </CardHeader>
        <CardContent>
          {totalAging === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun ticket aperto</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={agingData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    percent > 0.05 ? `${name}` : ""
                  }
                  labelLine={false}
                >
                  {agingData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                  formatter={(value: number) => [`${value} ticket`, ""]}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Backlog Trend */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Andamento Backlog</CardTitle>
        </CardHeader>
        <CardContent>
          {backlogData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={backlogData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fontSize: 12 }}
                  className="text-muted-foreground"
                />
                <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="backlog"
                  stroke="hsl(var(--chart-5))"
                  fill="hsl(var(--chart-5) / 0.3)"
                  strokeWidth={2}
                  name="Backlog"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Top Categories */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Top Categorie</CardTitle>
        </CardHeader>
        <CardContent>
          {data.top_categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun dato</p>
          ) : (
            <div className="space-y-3">
              {data.top_categories.slice(0, 5).map((cat, index) => (
                <div key={cat.tag_id || `no-cat-${index}`} className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: cat.tag_color }}
                  />
                  <span className="text-sm flex-1 truncate">{cat.tag_name}</span>
                  <span className="text-sm font-medium tabular-nums">{cat.count}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
