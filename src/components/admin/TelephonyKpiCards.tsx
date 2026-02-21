import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Phone, PhoneIncoming, PhoneOff, Clock, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TelephonyKpis } from "@/hooks/useCallTranscripts";

interface TelephonyKpiCardsProps {
  data: TelephonyKpis;
  isLoading: boolean;
}

function formatSeconds(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function TelephonyKpiCards({ data, isLoading }: TelephonyKpiCardsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-4 w-24 mt-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const trendData = (data.daily_trend || []).map((d) => ({
    ...d,
    dateLabel: format(new Date(d.call_date), "dd/MM", { locale: it }),
  }));

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-medium">Chiamate Totali</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{data.total_calls}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-medium">Risposte</CardTitle>
            <PhoneIncoming className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{data.answered_calls}</div>
            <p className="text-[10px] text-muted-foreground">
              Rate: {data.answered_rate}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-medium">Perse</CardTitle>
            <PhoneOff className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{data.missed_calls}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-medium">Durata Media</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{formatSeconds(data.avg_duration_seconds)}</div>
            <p className="text-[10px] text-muted-foreground">
              P90: {formatSeconds(data.p90_duration_seconds)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3">
            <CardTitle className="text-xs font-medium">Tempo Risposta</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="text-xl font-bold">{formatSeconds(data.avg_response_time_seconds)}</div>
            <p className="text-[10px] text-muted-foreground">
              P90: {formatSeconds(data.p90_response_time_seconds)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily trend chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trend Giornaliero Chiamate</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="dateLabel" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                  }}
                />
                <Legend />
                <Bar dataKey="answered" name="Risposte" fill="hsl(var(--chart-3))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="missed" name="Perse" fill="hsl(var(--destructive))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Operator table */}
      {data.by_operator && data.by_operator.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <CardTitle className="text-base">Performance Telefonica per Operatore</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 md:p-6 md:pt-0">
            <ScrollArea className="w-full">
              <div className="min-w-[500px]">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 text-xs font-medium">Operatore</th>
                      <th className="text-right p-3 text-xs font-medium">Totali</th>
                      <th className="text-right p-3 text-xs font-medium">Risposte</th>
                      <th className="text-right p-3 text-xs font-medium">Rate</th>
                      <th className="text-right p-3 text-xs font-medium">Durata Avg</th>
                      <th className="text-right p-3 text-xs font-medium">Risposta Avg</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_operator.map((op) => {
                      const rate = op.total > 0 ? Math.round((op.answered / op.total) * 100) : 0;
                      return (
                        <tr key={op.user_id} className="border-t">
                          <td className="p-3 text-sm font-medium">{op.full_name || "Operatore"}</td>
                          <td className="p-3 text-right text-sm">{op.total}</td>
                          <td className="p-3 text-right text-sm">{op.answered}</td>
                          <td className="p-3 text-right text-sm">
                            <span className={cn(
                              rate < 70 ? "text-destructive" : rate < 85 ? "text-amber-600 dark:text-amber-400" : "text-primary"
                            )}>
                              {rate}%
                            </span>
                          </td>
                          <td className="p-3 text-right text-sm">{formatSeconds(op.avg_duration)}</td>
                          <td className="p-3 text-right text-sm">{formatSeconds(op.avg_response_time)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
