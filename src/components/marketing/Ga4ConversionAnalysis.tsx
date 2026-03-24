import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowDown, TrendingDown } from "lucide-react";
import type { Ga4Summary } from "@/hooks/useGa4Stats";
import type { AdPlatformStatSummary } from "@/types/adPlatform";

interface Ga4ConversionAnalysisProps {
  ga4Summary: Ga4Summary;
  advSummary?: AdPlatformStatSummary | null;
  crmLeads: number;
  isLoading: boolean;
}

export function Ga4ConversionAnalysis({
  ga4Summary,
  advSummary,
  crmLeads,
  isLoading,
}: Ga4ConversionAnalysisProps) {
  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingDown className="h-4 w-4" />
            Analisi Conversioni — Perché non converto?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-20 flex items-center justify-center text-muted-foreground">
            Caricamento...
          </div>
        </CardContent>
      </Card>
    );
  }

  const impressions = advSummary?.total_impressions || 0;
  const clicks = advSummary?.total_clicks || 0;
  const sessions = ga4Summary.sessions;
  const leads = crmLeads;

  // Drop-off rates
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const clickToSession = clicks > 0 ? (sessions / clicks) * 100 : 0;
  const sessionToLead = sessions > 0 ? (leads / sessions) * 100 : 0;
  const bounceRate = ga4Summary.bounce_rate * 100;

  const funnelSteps = [
    { label: "Impressioni ADV", value: impressions },
    { label: "Click ADV", value: clicks, rate: ctr, rateLabel: "CTR" },
    { label: "Sessioni Sito", value: sessions, rate: clickToSession, rateLabel: "Click → Sessione" },
    { label: "Lead CRM", value: leads, rate: sessionToLead, rateLabel: "Sessione → Lead" },
  ];

  // Generate insights
  const insights: string[] = [];
  if (bounceRate > 70) {
    insights.push(
      `Il bounce rate è alto (${bounceRate.toFixed(1)}%). Gli utenti lasciano il sito senza interagire — verifica che la landing page sia coerente con l'annuncio e il tempo di caricamento.`
    );
  }
  if (clickToSession < 60 && clicks > 0) {
    insights.push(
      `Solo il ${clickToSession.toFixed(0)}% dei click ADV genera una sessione sul sito. Possibile problema di tracking o tempi di caricamento eccessivi.`
    );
  }
  if (sessionToLead < 2 && sessions > 50) {
    insights.push(
      `Il tasso di conversione sessione → lead è molto basso (${sessionToLead.toFixed(1)}%). Il form o la CTA potrebbero non essere abbastanza visibili o convincenti.`
    );
  }
  if (ctr < 1 && impressions > 1000) {
    insights.push(
      `Il CTR è sotto l'1% (${ctr.toFixed(2)}%). Le creatività ADV potrebbero non essere abbastanza accattivanti per il target.`
    );
  }
  if (ga4Summary.avg_session_duration < 30 && sessions > 50) {
    insights.push(
      `La durata media della sessione è solo ${Math.round(ga4Summary.avg_session_duration)}s. Gli utenti non leggono i contenuti — il messaggio potrebbe non essere rilevante.`
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingDown className="h-4 w-4" />
          Analisi Conversioni — Perché non converto?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Funnel */}
        <div className="flex flex-col gap-2">
          {funnelSteps.map((step, idx) => (
            <div key={step.label}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{step.label}</span>
                <span className="text-lg font-bold">{step.value.toLocaleString("it-IT")}</span>
              </div>
              {idx < funnelSteps.length - 1 && (
                <div className="flex items-center gap-2 pl-4 py-1">
                  <ArrowDown className="h-3 w-3 text-muted-foreground" />
                  {funnelSteps[idx + 1].rate !== undefined && (
                    <span
                      className={`text-xs font-medium ${
                        (funnelSteps[idx + 1].rate || 0) < 5
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }`}
                    >
                      {funnelSteps[idx + 1].rateLabel}: {(funnelSteps[idx + 1].rate || 0).toFixed(1)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Suggerimenti
            </h4>
            {insights.map((insight, idx) => (
              <Alert key={idx} className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
                <AlertDescription className="text-sm">{insight}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}

        {insights.length === 0 && impressions > 0 && (
          <Alert className="border-green-200 bg-green-50 dark:bg-green-950/20">
            <AlertDescription className="text-sm">
              I KPI del funnel sono nei range normali. Continua a monitorare per identificare trend.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
