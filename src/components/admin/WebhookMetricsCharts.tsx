import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  AreaChart,
  Area,
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
import type { TimeseriesBucket, TopEventType, TopWebhook } from "@/hooks/useWebhookMetrics";

interface WebhookMetricsChartsProps {
  timeseries: TimeseriesBucket[];
  topEventTypes: TopEventType[];
  topWebhooks: TopWebhook[];
}

const timeseriesConfig: ChartConfig = {
  success_count: {
    label: "Success",
    color: "hsl(var(--chart-1))",
  },
  failed_count: {
    label: "Failed",
    color: "hsl(var(--chart-2))",
  },
};

const eventTypeConfig: ChartConfig = {
  total_count: {
    label: "Deliveries",
    color: "hsl(var(--chart-3))",
  },
};

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function WebhookMetricsCharts({
  timeseries,
  topEventTypes,
  topWebhooks,
}: WebhookMetricsChartsProps) {
  // Format timeseries for display
  const formattedTimeseries = timeseries.map((bucket) => ({
    ...bucket,
    time: format(new Date(bucket.bucket), "HH:mm", { locale: it }),
  }));

  // Calculate success rate timeseries
  const successRateData = timeseries.map((bucket) => ({
    time: format(new Date(bucket.bucket), "HH:mm", { locale: it }),
    rate: bucket.total_count > 0
      ? Math.round((bucket.success_count / bucket.total_count) * 100)
      : 0,
  }));

  // Prepare pie chart data for event types
  const eventTypePieData = topEventTypes.slice(0, 5).map((et) => ({
    name: et.event_type.replace("ticket.", "").replace(".", " "),
    value: et.total_count,
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="webhooks-dashboard-charts">
      {/* Deliveries Over Time */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Deliveries nel tempo (24h)</CardTitle>
          <CardDescription>Andamento success/failed per bucket da 15 minuti</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={timeseriesConfig} className="h-[300px] w-full">
            <AreaChart data={formattedTimeseries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="success_count"
                stackId="1"
                stroke="var(--color-success_count)"
                fill="var(--color-success_count)"
                fillOpacity={0.6}
              />
              <Area
                type="monotone"
                dataKey="failed_count"
                stackId="1"
                stroke="var(--color-failed_count)"
                fill="var(--color-failed_count)"
                fillOpacity={0.6}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Success Rate Over Time */}
      <Card>
        <CardHeader>
          <CardTitle>Success Rate % (24h)</CardTitle>
          <CardDescription>Percentuale di successo per bucket</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={{ rate: { label: "Rate", color: "hsl(var(--chart-1))" } }} className="h-[250px] w-full">
            <AreaChart data={successRateData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
              />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickMargin={8} />
              <ChartTooltip
                content={<ChartTooltipContent formatter={(value) => `${value}%`} />}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke="var(--color-rate)"
                fill="var(--color-rate)"
                fillOpacity={0.3}
              />
            </AreaChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Event Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Top Event Types (24h)</CardTitle>
          <CardDescription>Distribuzione per tipo di evento</CardDescription>
        </CardHeader>
        <CardContent>
          {eventTypePieData.length > 0 ? (
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={eventTypePieData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                  >
                    {eventTypePieData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <ChartTooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-[250px] items-center justify-center text-muted-foreground">
              Nessun dato disponibile
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Webhook Performance */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Performance per Webhook (24h)</CardTitle>
          <CardDescription>Fail rate e volume per endpoint</CardDescription>
        </CardHeader>
        <CardContent>
          {topWebhooks.length > 0 ? (
            <ChartContainer config={eventTypeConfig} className="h-[300px] w-full">
              <BarChart
                data={topWebhooks}
                layout="vertical"
                margin={{ left: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="webhook_name"
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        if (name === "success_count") return [`${value}`, "Success"];
                        if (name === "failed_count") return [`${value}`, "Failed"];
                        return [value, name];
                      }}
                    />
                  }
                />
                <Bar dataKey="success_count" stackId="a" fill="hsl(var(--chart-1))" />
                <Bar dataKey="failed_count" stackId="a" fill="hsl(var(--chart-2))" />
              </BarChart>
            </ChartContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              Nessun webhook attivo nelle ultime 24h
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
