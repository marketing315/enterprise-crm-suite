import { useState } from "react";
import { useAIMetricsErrors, type MetricsPeriod } from "@/hooks/useAIMetrics";
import { useAIQualityMetrics, useAIFeedback, useCreateAIFeedback } from "@/hooks/useAIConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useBrand } from "@/contexts/BrandContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Award,
  ThumbsUp,
  ThumbsDown,
  GitBranch,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
} from "lucide-react";

const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
];

export function AIQualityTab() {
  const [period, setPeriod] = useState<MetricsPeriod>("7d");
  const { user } = useAuth();
  const { currentBrand } = useBrand();

  const { data: quality, isLoading: loadingQuality } = useAIQualityMetrics(period);
  const { data: errors = [], isLoading: loadingErrors } = useAIMetricsErrors(period);
  const { data: feedback = [], isLoading: loadingFeedback } = useAIFeedback();
  const createFeedback = useCreateAIFeedback();

  const handleExportCSV = () => {
    // Export feedback data as CSV
    if (!feedback.length) return;

    const headers = ["ID", "Decisione", "Label", "Note", "Data"];
    const rows = feedback.map((f) => [
      f.id,
      f.ai_decision_id,
      f.label,
      f.note || "",
      format(new Date(f.created_at), "yyyy-MM-dd HH:mm"),
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((r) => r.join(";")),
    ].join("\n");

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

      {/* Quality Metrics */}
      {loadingQuality ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : quality ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                Override Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${getOverrideRateColor(quality.override_rate)}`}>
                {quality.override_rate}%
              </div>
              <p className="text-sm text-muted-foreground">
                {quality.override_count} su {quality.total_decisions} decisioni
              </p>
              <Progress
                value={100 - quality.override_rate}
                className="mt-2 h-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ThumbsUp className="h-4 w-4" />
                Feedback positivo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">
                {quality.feedback_correct}
              </div>
              <p className="text-sm text-muted-foreground">
                Decisioni valutate corrette
              </p>
              <div className="flex items-center gap-2 mt-2">
                <TrendingUp className="h-4 w-4 text-green-500" />
                <span className="text-sm text-green-500">
                  {quality.feedback_accuracy !== null
                    ? `${quality.feedback_accuracy}% accuratezza`
                    : "N/A"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <ThumbsDown className="h-4 w-4" />
                Feedback negativo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-500">
                {quality.feedback_incorrect}
              </div>
              <p className="text-sm text-muted-foreground">
                Decisioni valutate errate
              </p>
              <div className="flex items-center gap-2 mt-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-500">
                  Richiede analisi prompt
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Top Errors */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Errori frequenti
          </CardTitle>
          <CardDescription>
            Tipologie di errore più comuni nelle decisioni AI
          </CardDescription>
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
                      <TableCell className="font-mono text-sm max-w-[300px] truncate">
                        {err.error}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={err.count > 10 ? "destructive" : "secondary"}>
                          {err.count}
                        </Badge>
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
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Storico feedback
            </CardTitle>
            <CardDescription>
              Valutazioni umane sulle decisioni AI
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleExportCSV}
            disabled={feedback.length === 0}
          >
            <Download className="h-4 w-4" />
            Esporta CSV
          </Button>
        </CardHeader>
        <CardContent>
          {loadingFeedback ? (
            <Skeleton className="h-48 w-full" />
          ) : feedback.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Award className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nessun feedback registrato</p>
              <p className="text-sm">
                Valuta le decisioni AI dalla pagina Eventi
              </p>
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
                        {format(new Date(f.created_at), "dd/MM HH:mm", {
                          locale: it,
                        })}
                      </TableCell>
                      <TableCell>
                        {f.label === "correct" ? (
                          <Badge variant="default" className="gap-1">
                            <ThumbsUp className="h-3 w-3" />
                            Corretta
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <ThumbsDown className="h-3 w-3" />
                            Errata
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {f.note || "-"}
                      </TableCell>
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
