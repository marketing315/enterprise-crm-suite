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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import type { CallcenterKpisOverview } from "@/hooks/useCallcenterKpis";

interface CallcenterKpiChartsProps {
  overview: CallcenterKpisOverview;
}

const STATUS_COLORS: Record<string, string> = {
  open: "hsl(var(--chart-1))",
  in_progress: "hsl(var(--chart-2))",
  resolved: "hsl(var(--chart-3))",
  closed: "hsl(var(--chart-4))",
  reopened: "hsl(var(--chart-5))",
};

const STATUS_LABELS: Record<string, string> = {
  open: "Aperto",
  in_progress: "In Lavorazione",
  resolved: "Risolto",
  closed: "Chiuso",
  reopened: "Riaperto",
};

const PRIORITY_COLORS = [
  "hsl(var(--destructive))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--muted-foreground))",
];

const PRIORITY_LABELS: Record<number, string> = {
  1: "Critica",
  2: "Alta",
  3: "Media",
  4: "Bassa",
  5: "Minima",
};

export function CallcenterKpiCharts({ overview }: CallcenterKpiChartsProps) {
  // Format daily trend data
  const trendData = overview.daily_trend.map((day) => ({
    ...day,
    dateLabel: format(new Date(day.date), "dd/MM", { locale: it }),
  }));

  // Format status distribution
  const statusData = overview.status_distribution.map((s) => ({
    name: STATUS_LABELS[s.status] || s.status,
    value: s.count,
    color: STATUS_COLORS[s.status] || "hsl(var(--muted))",
  }));

  // Format priority distribution
  const priorityData = overview.priority_distribution.map((p) => ({
    priority: PRIORITY_LABELS[p.priority] || `P${p.priority}`,
    count: p.count,
    fill: PRIORITY_COLORS[p.priority - 1] || PRIORITY_COLORS[4],
  }));

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
                <Legend />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Status Distribution Pie Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Distribuzione Status</CardTitle>
        </CardHeader>
        <CardContent>
          {statusData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) =>
                    percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ""
                  }
                  labelLine={false}
                >
                  {statusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Priority Distribution Bar Chart */}
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Distribuzione per Priorità</CardTitle>
        </CardHeader>
        <CardContent>
          {priorityData.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">Nessun dato</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priorityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="priority"
                  tick={{ fontSize: 12 }}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Bar dataKey="count" name="Ticket" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
