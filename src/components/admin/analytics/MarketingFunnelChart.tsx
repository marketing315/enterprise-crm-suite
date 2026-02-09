import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FunnelMetrics } from "@/hooks/useFunnelMetrics";
import { Eye, MousePointerClick, UserPlus, Phone, PhoneIncoming, CalendarCheck, Trophy, TrendingDown } from "lucide-react";

interface MarketingFunnelChartProps {
  data?: FunnelMetrics;
  isLoading?: boolean;
}

const FUNNEL_STAGES = [
  { key: "impressions", label: "Impressions", icon: Eye, color: "hsl(210, 70%, 60%)" },
  { key: "clicks", label: "Click", icon: MousePointerClick, color: "hsl(200, 70%, 55%)" },
  { key: "leads", label: "Lead", icon: UserPlus, color: "hsl(142, 60%, 45%)" },
  { key: "called_contacts", label: "Chiamati", icon: Phone, color: "hsl(45, 80%, 50%)" },
  { key: "answered_contacts", label: "Risposti", icon: PhoneIncoming, color: "hsl(25, 80%, 55%)" },
  { key: "appointments", label: "Appuntamenti", icon: CalendarCheck, color: "hsl(270, 60%, 55%)" },
  { key: "sales", label: "Vendite", icon: Trophy, color: "hsl(142, 70%, 35%)" },
] as const;

const CONVERSION_KEYS: { from: string; to: string; key: keyof FunnelMetrics["conversions"] }[] = [
  { from: "impressions", to: "clicks", key: "impression_to_click" },
  { from: "clicks", to: "leads", key: "click_to_lead" },
  { from: "leads", to: "called_contacts", key: "lead_to_called" },
  { from: "called_contacts", to: "answered_contacts", key: "called_to_answered" },
  { from: "answered_contacts", to: "appointments", key: "answered_to_appointment" },
  { from: "appointments", to: "sales", key: "appointment_to_sale" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function MarketingFunnelChart({ data, isLoading }: MarketingFunnelChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Funnel Marketing</CardTitle>
          <CardDescription>Da impression a vendita</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                <div className="h-12 bg-muted animate-pulse rounded-lg" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxValue = data
    ? Math.max(...FUNNEL_STAGES.map(s => (data as any)[s.key] || 0), 1)
    : 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Funnel Marketing</CardTitle>
        <CardDescription>
          Da impression a vendita • Conversione complessiva{" "}
          <span className="font-semibold text-foreground">
            {data?.conversions?.overall ?? 0}%
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!data ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessun dato disponibile per il periodo selezionato
          </div>
        ) : (
          <div className="space-y-1">
            {FUNNEL_STAGES.map((stage, index) => {
              const value = (data as any)[stage.key] as number || 0;
              const widthPercent = maxValue > 0 ? (value / maxValue) * 100 : 0;
              const Icon = stage.icon;
              const conversionKey = CONVERSION_KEYS[index];
              const convRate = conversionKey ? (data.conversions as any)[conversionKey.key] : null;
              const prevValue = index > 0 ? (data as any)[FUNNEL_STAGES[index - 1].key] as number || 0 : 0;
              const dropOff = index > 0 ? prevValue - value : 0;

              return (
                <div key={stage.key}>
                  {/* Conversion arrow between stages */}
                  {index > 0 && (
                    <div className="flex items-center gap-2 py-1.5 pl-8">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingDown className="h-3 w-3" />
                        <span>
                          {CONVERSION_KEYS[index - 1] &&
                            `${(data.conversions as any)[CONVERSION_KEYS[index - 1].key]}%`}
                        </span>
                        {dropOff > 0 && (
                          <span className="text-destructive ml-1">
                            −{formatNumber(dropOff)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Stage bar */}
                  <div className="flex items-center gap-3">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: stage.color, opacity: 0.15 }}
                    >
                      <Icon className="h-4 w-4" style={{ color: stage.color }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium">{stage.label}</span>
                        <span className="font-bold tabular-nums">{formatNumber(value)}</span>
                      </div>
                      <div className="relative h-8 bg-muted/50 rounded-lg overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 rounded-lg transition-all duration-700 ease-out"
                          style={{
                            width: `${Math.max(widthPercent, 2)}%`,
                            backgroundColor: stage.color,
                            opacity: 0.75,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Revenue summary */}
        {data && data.sales_revenue > 0 && (
          <div className="mt-6 pt-4 border-t text-center">
            <p className="text-2xl font-bold text-primary">
              €{(data.sales_revenue / 1000).toFixed(1)}K
            </p>
            <p className="text-xs text-muted-foreground">Revenue da vendite chiuse</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
