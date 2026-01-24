import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";

interface DailyTrendData {
  date: string;
  completed: number;
  failed: number;
}

interface DistributionData {
  type?: string;
  priority?: number;
  count: number;
}

interface AIMetricsChartsProps {
  dailyTrend: DailyTrendData[];
  leadTypeDistribution: DistributionData[];
  priorityDistribution: DistributionData[];
}

const trendChartConfig: ChartConfig = {
  completed: {
    label: "Completati",
    color: "hsl(var(--chart-1))",
  },
  failed: {
    label: "Falliti",
    color: "hsl(var(--chart-2))",
  },
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const LEAD_TYPE_LABELS: Record<string, string> = {
  trial: "Prova",
  info: "Info",
  support: "Supporto",
  generic: "Generico",
};

export function AIMetricsCharts({
  dailyTrend,
  leadTypeDistribution,
  priorityDistribution,
}: AIMetricsChartsProps) {
  const formattedTrend = dailyTrend.map((d) => ({
    ...d,
    dateLabel: format(new Date(d.date), "dd MMM", { locale: it }),
  }));

  const formattedLeadTypes = leadTypeDistribution.map((d) => ({
    name: LEAD_TYPE_LABELS[d.type || ""] || d.type || "N/A",
    value: d.count,
  }));

  const formattedPriorities = priorityDistribution.map((d) => ({
    name: `P${d.priority}`,
    value: d.count,
    priority: d.priority,
  }));

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {/* Daily Trend Chart */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Trend Giornaliero</CardTitle>
          <CardDescription>Job completati vs falliti</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendChartConfig} className="h-[250px] w-full">
            <LineChart data={formattedTrend}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="dateLabel"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="var(--color-completed)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke="var(--color-failed)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Lead Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tipi di Lead</CardTitle>
          <CardDescription>Distribuzione classificazioni</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={formattedLeadTypes}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {formattedLeadTypes.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">{payload[0].name}</div>
                          <div className="text-muted-foreground">
                            {payload[0].value} eventi
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {formattedLeadTypes.map((item, index) => (
              <div key={item.name} className="flex items-center gap-1 text-xs">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <span>{item.name}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Priority Distribution */}
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Distribuzione Priorità</CardTitle>
          <CardDescription>Numero eventi per livello di priorità (1=alta, 5=bassa)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={formattedPriorities} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <ChartTooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <div className="font-medium">Priorità {payload[0].payload.priority}</div>
                          <div className="text-muted-foreground">
                            {payload[0].value} eventi
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {formattedPriorities.map((entry) => (
                    <Cell
                      key={`cell-${entry.priority}`}
                      fill={
                        entry.priority === 1
                          ? "hsl(var(--destructive))"
                          : entry.priority === 2
                          ? "hsl(24 95% 53%)"
                          : entry.priority === 3
                          ? "hsl(48 96% 53%)"
                          : "hsl(var(--primary))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
