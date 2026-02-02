import { useState } from "react";
import { useAIMetricsOverview, type MetricsPeriod } from "@/hooks/useAIMetrics";
import { useAIConfig, useUpdateAIConfig, useAIQualityMetrics, type AIMode } from "@/hooks/useAIConfig";
import { MetricCard } from "@/components/admin/MetricCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Zap,
  Timer,
  GitBranch,
  ThumbsUp,
  ThumbsDown,
  RefreshCw,
  Power,
} from "lucide-react";

const PERIOD_OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Oggi" },
  { value: "7d", label: "7g" },
  { value: "30d", label: "30g" },
];

const AI_MODES: { value: AIMode; label: string; description: string }[] = [
  { value: "off", label: "Disattivata", description: "L'AI non processa i lead" },
  { value: "suggest", label: "Solo suggerimenti", description: "L'AI suggerisce ma non applica" },
  { value: "auto_apply", label: "Applicazione automatica", description: "L'AI applica automaticamente le decisioni" },
];

export function AIOverviewTab() {
  const [period, setPeriod] = useState<MetricsPeriod>("7d");
  
  const { data: overview, isLoading: loadingOverview } = useAIMetricsOverview(period);
  const { data: config, isLoading: loadingConfig } = useAIConfig();
  const { data: quality, isLoading: loadingQuality } = useAIQualityMetrics(period);
  const updateConfig = useUpdateAIConfig();

  const successRate = overview?.job_counts.total
    ? Math.round((overview.job_counts.completed / overview.job_counts.total) * 100)
    : 0;

  const failRate = overview?.job_counts.total
    ? Math.round((overview.job_counts.failed / overview.job_counts.total) * 100)
    : 0;

  const getModeLabel = (mode: string | undefined) => {
    switch (mode) {
      case "off": return "Disattivata";
      case "suggest": return "Solo suggerimenti";
      case "auto_apply": return "Applicazione automatica";
      default: return "Non configurata";
    }
  };

  const getModeVariant = (mode: string | undefined): "default" | "secondary" | "destructive" | "outline" => {
    switch (mode) {
      case "off": return "destructive";
      case "suggest": return "secondary";
      case "auto_apply": return "default";
      default: return "outline";
    }
  };

  const handleModeChange = (newMode: AIMode) => {
    if (!config?.id) return;
    updateConfig.mutate({
      id: config.id,
      updates: { mode: newMode },
    });
  };

  const handleToggle = (enabled: boolean) => {
    if (!config?.id) return;
    const newMode: AIMode = enabled ? "suggest" : "off";
    updateConfig.mutate({
      id: config.id,
      updates: { mode: newMode },
    });
  };

  const isEnabled = config?.mode !== "off";

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

      {/* AI Mode Status Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Stato AI
          </CardTitle>
          <CardDescription>
            Modalità operativa corrente per questo brand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingConfig ? (
            <Skeleton className="h-8 w-40" />
          ) : (
            <>
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="ai-enabled" className="text-base font-medium flex items-center gap-2">
                    <Power className="h-4 w-4" />
                    AI Attiva
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {isEnabled ? "L'AI sta processando i lead" : "L'AI è spenta per questo brand"}
                  </p>
                </div>
                <Switch
                  id="ai-enabled"
                  checked={isEnabled}
                  onCheckedChange={handleToggle}
                  disabled={updateConfig.isPending || !config?.id}
                />
              </div>

              {/* Mode Selector (only when enabled) */}
              {isEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="ai-mode">Modalità operativa</Label>
                  <Select
                    value={config?.mode || "suggest"}
                    onValueChange={(value) => handleModeChange(value as AIMode)}
                    disabled={updateConfig.isPending}
                  >
                    <SelectTrigger id="ai-mode">
                      <SelectValue placeholder="Seleziona modalità" />
                    </SelectTrigger>
                    <SelectContent>
                      {AI_MODES.filter(m => m.value !== "off").map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          <div className="flex flex-col">
                            <span>{mode.label}</span>
                            <span className="text-xs text-muted-foreground">{mode.description}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Current Status Badge */}
              <div className="flex items-center gap-4 pt-2">
                <Badge variant={getModeVariant(config?.mode)} className="text-sm px-3 py-1">
                  {getModeLabel(config?.mode)}
                </Badge>
                {config?.active_prompt_version && (
                  <span className="text-sm text-muted-foreground">
                    Prompt: v{config.active_prompt_version}
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* KPI Grid */}
      {loadingOverview ? (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-[100px]" />
          ))}
        </div>
      ) : overview ? (
        <ScrollArea className="w-full">
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 min-w-[600px] lg:min-w-0 pb-2">
            <MetricCard
              title="Decisioni Totali"
              value={overview.job_counts.total}
              icon={Activity}
              subtitle={`${overview.job_counts.pending} in coda`}
            />
            <MetricCard
              title="Success Rate"
              value={`${successRate}%`}
              icon={CheckCircle2}
              variant={successRate >= 90 ? "success" : successRate >= 70 ? "warning" : "danger"}
              subtitle={`${overview.job_counts.completed} completati`}
            />
            <MetricCard
              title="Fail Rate"
              value={`${failRate}%`}
              icon={XCircle}
              variant={failRate <= 5 ? "success" : failRate <= 15 ? "warning" : "danger"}
              subtitle={`${overview.job_counts.failed} falliti`}
            />
            <MetricCard
              title="Backlog"
              value={overview.job_counts.pending + overview.job_counts.processing}
              icon={Clock}
              variant={
                overview.job_counts.pending > 10
                  ? "danger"
                  : overview.job_counts.pending > 5
                  ? "warning"
                  : "success"
              }
              subtitle="pending + processing"
            />
            <MetricCard
              title="Fallback"
              value={overview.fallback_count}
              icon={AlertTriangle}
              variant={overview.fallback_count > 0 ? "warning" : "success"}
              subtitle="AI non disponibile"
            />
            <MetricCard
              title="Latenza Media"
              value={`${Math.round(overview.latency.avg_ms / 1000)}s`}
              icon={Timer}
              subtitle={`P95: ${Math.round(overview.latency.p95_ms / 1000)}s`}
            />
            <MetricCard
              title="Tentativi Medi"
              value={overview.latency.avg_attempts}
              icon={RefreshCw}
              variant={overview.latency.avg_attempts > 2 ? "warning" : "success"}
            />
            {quality && (
              <MetricCard
                title="Override Rate"
                value={`${quality.override_rate}%`}
                icon={GitBranch}
                variant={quality.override_rate <= 10 ? "success" : quality.override_rate <= 25 ? "warning" : "danger"}
                subtitle={`${quality.override_count} override`}
              />
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      ) : null}

      {/* Feedback Summary */}
      {!loadingQuality && quality && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Feedback umano</CardTitle>
            <CardDescription>
              Valutazioni degli operatori sulle decisioni AI
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
                  <ThumbsUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{quality.feedback_correct}</div>
                  <div className="text-xs text-muted-foreground">Corrette</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 dark:bg-red-900/30">
                  <ThumbsDown className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold">{quality.feedback_incorrect}</div>
                  <div className="text-xs text-muted-foreground">Errate</div>
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-3">
                {quality.feedback_accuracy !== null && (
                  <>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="text-2xl font-bold">{quality.feedback_accuracy}%</div>
                      <div className="text-xs text-muted-foreground">Accuratezza percepita</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Tags & Stages */}
      {!loadingOverview && overview && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Top Lead Types</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.lead_type_distribution.slice(0, 5).map((item) => (
                  <div key={item.type} className="flex items-center justify-between">
                    <Badge variant="outline">{item.type}</Badge>
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Distribuzione Priorità</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {overview.priority_distribution.map((item) => (
                  <div key={item.priority} className="flex items-center justify-between">
                    <Badge variant={item.priority >= 4 ? "destructive" : item.priority >= 3 ? "secondary" : "outline"}>
                      P{item.priority}
                    </Badge>
                    <span className="text-sm font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
