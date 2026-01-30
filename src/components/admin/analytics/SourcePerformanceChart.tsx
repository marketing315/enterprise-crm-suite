import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SourceAnalytics, LeadSourceMetrics } from "@/hooks/useAdvancedAnalytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface SourcePerformanceChartProps {
  data?: SourceAnalytics;
  isLoading?: boolean;
}

const SOURCE_COLORS: Record<string, string> = {
  meta: "hsl(214, 89%, 52%)",
  webhook: "hsl(142, 71%, 45%)",
  manual: "hsl(262, 83%, 58%)",
  default: "hsl(var(--primary))",
};

const SOURCE_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  webhook: "Webhook",
  manual: "Manuale",
};

function formatCurrency(value: number): string {
  if (value >= 1000) {
    return `€${(value / 1000).toFixed(1)}K`;
  }
  return `€${value.toFixed(0)}`;
}

export function SourcePerformanceChart({ data, isLoading }: SourcePerformanceChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Fonti Lead</CardTitle>
          <CardDescription>Analisi conversioni per fonte</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted animate-pulse rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  const sources = data?.sources ?? [];

  const chartData = sources.map(s => ({
    name: SOURCE_LABELS[s.source] || s.source_name,
    leads: s.leads_count,
    conversions: s.deals_won,
    color: SOURCE_COLORS[s.source] || SOURCE_COLORS.default,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Performance Fonti Lead</CardTitle>
        <CardDescription>
          {data?.total_leads ?? 0} lead totali • {formatCurrency(data?.total_revenue ?? 0)} revenue
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bar Chart */}
        {chartData.length > 0 ? (
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    value,
                    name === "leads" ? "Lead" : "Conversioni"
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                />
                <Bar dataKey="leads" name="leads" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-[200px] flex items-center justify-center text-muted-foreground">
            Nessun dato disponibile
          </div>
        )}

        {/* Detail Table */}
        {sources.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead className="text-right">Lead</TableHead>
                <TableHead className="text-right">Deal Creati</TableHead>
                <TableHead className="text-right">Vinti</TableHead>
                <TableHead className="text-right">Conv. %</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.source + source.source_name}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-2 h-2 rounded-full" 
                        style={{ backgroundColor: SOURCE_COLORS[source.source] || SOURCE_COLORS.default }}
                      />
                      <span className="font-medium">
                        {SOURCE_LABELS[source.source] || source.source_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{source.leads_count}</TableCell>
                  <TableCell className="text-right">{source.deals_created}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={source.deals_won > 0 ? "default" : "secondary"}>
                      {source.deals_won}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={source.conversion_rate > 10 ? "text-emerald-600 dark:text-emerald-500 font-medium" : ""}>
                      {source.conversion_rate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(source.total_value_won)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
