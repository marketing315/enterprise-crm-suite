import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import type { LeadHistogramGranularity, LeadsBySourceBucket } from "@/hooks/useLeadsBySourceDay";

interface Props {
  data: LeadsBySourceBucket[] | undefined;
  isLoading: boolean;
  granularity: LeadHistogramGranularity;
  onGranularityChange: (g: LeadHistogramGranularity) => void;
}

const SOURCE_COLORS = [
  "hsl(var(--primary))",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#64748b",
];

export function LeadsHistogram({ data, isLoading, granularity, onGranularityChange }: Props) {
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());

  const { rows, sources, totals } = useMemo(() => {
    const sourceSet = new Set<string>();
    const totMap = new Map<string, number>();
    const bucketMap = new Map<string, Record<string, number | string>>();

    (data ?? []).forEach((d) => {
      sourceSet.add(d.source);
      totMap.set(d.source, Number(d.source_total));
      const key = d.bucket;
      if (!bucketMap.has(key)) bucketMap.set(key, { bucket: key });
      bucketMap.get(key)![d.source] = Number(d.lead_count);
    });

    const rs = Array.from(bucketMap.values()).sort((a, b) =>
      String(a.bucket).localeCompare(String(b.bucket))
    );
    return { rows: rs, sources: Array.from(sourceSet).sort(), totals: totMap };
  }, [data]);

  const xFormatter = (v: string) => {
    try {
      const d = parseISO(v);
      if (granularity === "hour") return format(d, "HH:mm");
      if (granularity === "week") return `S${format(d, "w")}`;
      return format(d, "d MMM", { locale: it });
    } catch {
      return v;
    }
  };

  const toggleSource = (s: string) => {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Lead per sorgente nel tempo</CardTitle>
        <div className="flex gap-1">
          {(["hour", "day", "week"] as LeadHistogramGranularity[]).map((g) => (
            <Button
              key={g}
              variant={granularity === g ? "default" : "outline"}
              size="sm"
              onClick={() => onGranularityChange(g)}
              className="h-7 text-xs"
            >
              {g === "hour" ? "Ora" : g === "day" ? "Giorno" : "Settimana"}
            </Button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : rows.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">
            Nessun lead nel periodo selezionato.
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rows} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="bucket" tickFormatter={xFormatter} className="text-xs" />
                <YAxis className="text-xs" allowDecimals={false} />
                <Tooltip
                  labelFormatter={(l) => xFormatter(String(l))}
                  contentStyle={{ borderRadius: 8, border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                />
                <Legend wrapperStyle={{ display: "none" }} />
                {sources.map((s, idx) => (
                  <Bar
                    key={s}
                    dataKey={s}
                    stackId="src"
                    fill={SOURCE_COLORS[idx % SOURCE_COLORS.length]}
                    hide={hiddenSources.has(s)}
                    radius={idx === sources.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            {/* Custom legend with totals */}
            <div className="mt-3 flex flex-wrap gap-2">
              {sources.map((s, idx) => {
                const isHidden = hiddenSources.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSource(s)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs transition-opacity ${
                      isHidden ? "opacity-40" : ""
                    } hover:bg-muted/50`}
                    type="button"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ backgroundColor: SOURCE_COLORS[idx % SOURCE_COLORS.length] }}
                    />
                    <span className="font-medium capitalize">{s}</span>
                    <span className="text-muted-foreground">· {(totals.get(s) ?? 0).toLocaleString("it-IT")}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
