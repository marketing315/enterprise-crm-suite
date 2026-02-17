import { useState } from "react";
import { useAIMetricsErrors, type MetricsPeriod } from "@/hooks/useAIMetrics";
import { useAIQualityMetrics, useAIFeedback, useCreateAIFeedback, useAIQualityDetailed } from "@/hooks/useAIConfig";
import { OVERRIDE_REASON_CATEGORIES } from "@/hooks/useOverrideAIDecision";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Award, ThumbsUp, ThumbsDown, GitBranch, AlertTriangle, TrendingUp, TrendingDown,
  Download, CheckCircle2, Clock, Target, BarChart3, ShieldCheck,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend,
} from "recharts";

const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
];

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  OVERRIDE_REASON_CATEGORIES.map((c) => [c.value, c.label])
);
CATEGORY_LABELS["unspecified"] = "Non specificato";

const BUCKET_COLORS: Record<string, string> = {
  "0-30%": "hsl(0, 70%, 55%)",
  "30-60%": "hsl(35, 80%, 55%)",
  "60-80%": "hsl(50, 80%, 50%)",
  "80-100%": "hsl(142, 70%, 45%)",
  "N/A": "hsl(220, 10%, 60%)",
};

export function AIQualityTab() {
  const [period, setPeriod] = useState<MetricsPeriod>("30d");
  const { user } = useAuth();
  const { currentBrand } = useBrand();

  const { data: quality, isLoading: loadingQuality } = useAIQualityMetrics(period);
  const { data: detailed, isLoading: loadingDetailed } = useAIQualityDetailed(period);
  const { data: errors = [], isLoading: loadingErrors } = useAIMetricsErrors(period);
  const { data: feedback = [], isLoading: loadingFeedback } = useAIFeedback();
  const createFeedback = useCreateAIFeedback();

  const handleExportCSV = () => {
    if (!feedback.length) return;
    const headers = ["ID", "Decisione", "Label", "Note", "Data"];
    const rows = feedback.map((f) => [
      f.id, f.ai_decision_id, f.label, f.note || "",
      format(new Date(f.created_at), "yyyy-MM-dd HH:mm"),
    ]);
    const csvContent = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ai-feedback-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getOverrideRateColor = (rate: number) => {
    if (rate <= 10) return "text-green-600";
    if (rate <= 25) return "text-amber-500";
    return "text-red-500";
  };

  return (
    <div className="space-y-6">
      {/* Period Selector */}
      <div className="flex justify-end gap-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={period === option.value ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriod(option.value)}
            className="px-3"
          >
            {option.label}
          </Button>
        ))}
      </div>

      {/* Top-level KPIs */}
      {loadingQuality || loadingDetailed ? (
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : quality && detailed ? (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> Override Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getOverrideRateColor(quality.override_rate)}`}>
                {quality.override_rate}%
              </div>
              <p className="text-xs text-muted-foreground">{quality.override_count}/{quality.total_decisions} decisioni</p>
              <Progress value={100 - quality.override_rate} className="mt-2 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Target className="h-4 w-4" /> Precision Proxy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {detailed.precision_proxy !== null ? `${detailed.precision_proxy}%` : "N/A"}
              </div>
              <p className="text-xs text-muted-foreground">Target ≥ 97%</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" /> Tempo triage medio
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{detailed.avg_triage_time_minutes}m</div>
              <p className="text-xs text-muted-foreground">Tempo override medio</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Low Confidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-amber-500">{detailed.low_confidence_count}</div>
              <p className="text-xs text-muted-foreground">Sotto soglia → human queue</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Feedback Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {quality.feedback_accuracy !== null ? `${quality.feedback_accuracy}%` : "N/A"}
              </div>
              <div className="flex gap-2 mt-1">
                <Badge variant="outline" className="text-xs gap-1"><ThumbsUp className="h-3 w-3" />{quality.feedback_correct}</Badge>
                <Badge variant="outline" className="text-xs gap-1"><ThumbsDown className="h-3 w-3" />{quality.feedback_incorrect}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Override by Category + Confidence Distribution */}
      {!loadingDetailed && detailed && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" /> Override per categoria
              </CardTitle>
              <CardDescription>Motivi più frequenti di override</CardDescription>
            </CardHeader>
            <CardContent>
              {detailed.override_by_category.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nessun override nel periodo</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={detailed.override_by_category.map(d => ({
                    ...d,
                    label: CATEGORY_LABELS[d.category] || d.category,
                  }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Target className="h-5 w-5" /> Distribuzione confidenza
              </CardTitle>
              <CardDescription>Decisioni per fascia di confidenza + override rate</CardDescription>
            </CardHeader>
            <CardContent>
              {detailed.confidence_distribution.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Nessun dato</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={detailed.confidence_distribution} margin={{ left: 0, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" name="Decisioni" radius={[4, 4, 0, 0]}>
                      {detailed.confidence_distribution.map((entry, i) => (
                        <Cell key={i} fill={BUCKET_COLORS[entry.bucket] || "hsl(var(--muted))"} />
                      ))}
                    </Bar>
                    <Bar dataKey="override_count" name="Override" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Weekly Override Trend */}
      {!loadingDetailed && detailed && detailed.weekly_override_trend.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className="h-5 w-5" /> Trend override settimanale
            </CardTitle>
            <CardDescription>Override rate % per settimana — target ≤ 10%</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={detailed.weekly_override_trend} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 'auto']} unit="%" />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Line type="monotone" dataKey="rate" name="Override %" stroke="hsl(var(--destructive))" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Top Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Errori frequenti</CardTitle>
          <CardDescription>Tipologie di errore più comuni nelle decisioni AI</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingErrors ? (
            <Skeleton className="h-32 w-full" />
          ) : errors.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
              <p>Nessun errore rilevato nel periodo selezionato</p>
            </div>
          ) : (
            <ScrollArea className="h-[200px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Errore</TableHead>
                    <TableHead className="text-right">Occorrenze</TableHead>
                    <TableHead>Ultima volta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {errors.map((err, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm max-w-[300px] truncate">{err.error}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={err.count > 10 ? "destructive" : "secondary"}>{err.count}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(err.last_occurrence), "dd/MM HH:mm", { locale: it })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Feedback History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5" /> Storico feedback</CardTitle>
            <CardDescription>Valutazioni umane sulle decisioni AI</CardDescription>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportCSV} disabled={feedback.length === 0}>
            <Download className="h-4 w-4" /> Esporta CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loadingFeedback ? (
            <Skeleton className="h-48 w-full" />
          ) : feedback.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun feedback registrato</p>
              <p className="text-sm">Valuta le decisioni AI dalla pagina Eventi</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Valutazione</TableHead>
                    <TableHead>Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {feedback.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-sm">
                        {format(new Date(f.created_at), "dd/MM HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell>
                        {f.label === "correct" ? (
                          <Badge variant="default" className="gap-1"><ThumbsUp className="h-3 w-3" /> Corretta</Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1"><ThumbsDown className="h-3 w-3" /> Errata</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{f.note || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
