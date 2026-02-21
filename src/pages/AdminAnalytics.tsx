import { useState } from "react";
import { useAdvancedAnalytics } from "@/hooks/useAdvancedAnalytics";
import { useFunnelMetrics } from "@/hooks/useFunnelMetrics";
import { useCplAnalytics, useAttributionSummary } from "@/hooks/useCplAnalytics";
import { AnalyticsKpiCards } from "@/components/admin/analytics/AnalyticsKpiCards";
import { FunnelChart } from "@/components/admin/analytics/FunnelChart";
import { MarketingFunnelChart } from "@/components/admin/analytics/MarketingFunnelChart";
import { FunnelLossTable } from "@/components/admin/analytics/FunnelLossTable";
import { FunnelBreakdownTable } from "@/components/admin/analytics/FunnelBreakdownTable";
import { SourcePerformanceChart } from "@/components/admin/analytics/SourcePerformanceChart";
import { TrendComparisonChart } from "@/components/admin/analytics/TrendComparisonChart";
import { CplKpiCards } from "@/components/admin/analytics/CplKpiCards";
import { CplTable } from "@/components/admin/analytics/CplTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, RefreshCw, BarChart3 } from "lucide-react";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";

export default function AdminAnalytics() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });

  const { funnel, sources, velocity, isLoading, refetch } = useAdvancedAnalytics({
    from: dateRange?.from,
    to: dateRange?.to,
  });

  const {
    metrics: funnelMetrics,
    losses: funnelLosses,
    breakdown: funnelBreakdown,
    isLoading: funnelLoading,
    refetch: refetchFunnel,
  } = useFunnelMetrics({
    from: dateRange?.from,
    to: dateRange?.to,
  });

  const [cplGroupBy, setCplGroupBy] = useState<"campaign" | "group">("campaign");

  const { data: cplData, isLoading: cplLoading } = useCplAnalytics({
    from: dateRange?.from,
    to: dateRange?.to,
    groupBy: cplGroupBy,
  });

  const { data: attrSummary, isLoading: attrLoading } = useAttributionSummary({
    from: dateRange?.from,
    to: dateRange?.to,
  });

  return (
    <div className="h-full overflow-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Analytics Avanzati</h1>
            <p className="text-sm text-muted-foreground">
              Metriche strategiche e performance
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal",
                  !dateRange && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, "d MMM", { locale: it })} -{" "}
                      {format(dateRange.to, "d MMM yyyy", { locale: it })}
                    </>
                  ) : (
                    format(dateRange.from, "d MMM yyyy", { locale: it })
                  )
                ) : (
                  <span>Seleziona periodo</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={dateRange?.from}
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                locale={it}
              />
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="icon" onClick={() => { refetch(); refetchFunnel(); }}>
            <RefreshCw className={cn("h-4 w-4", (isLoading || funnelLoading) && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <AnalyticsKpiCards
        funnel={funnel}
        sources={sources}
        velocity={velocity}
        isLoading={isLoading}
      />

      {/* Tabs */}
      <Tabs defaultValue="marketing-funnel" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-grid">
          <TabsTrigger value="marketing-funnel">Funnel Mkt</TabsTrigger>
          <TabsTrigger value="cpl">CPL</TabsTrigger>
          <TabsTrigger value="losses">Perdite</TabsTrigger>
          <TabsTrigger value="funnel">Pipeline</TabsTrigger>
          <TabsTrigger value="sources">Fonti</TabsTrigger>
          <TabsTrigger value="trends">Trend</TabsTrigger>
        </TabsList>

        <TabsContent value="marketing-funnel" className="space-y-4">
          <MarketingFunnelChart data={funnelMetrics} isLoading={funnelLoading} />
          <FunnelBreakdownTable data={funnelBreakdown} isLoading={funnelLoading} />
        </TabsContent>

        <TabsContent value="cpl" className="space-y-4">
          <CplKpiCards data={attrSummary} isLoading={attrLoading} />
          <div className="flex gap-2">
            <Button
              variant={cplGroupBy === "campaign" ? "default" : "outline"}
              size="sm"
              onClick={() => setCplGroupBy("campaign")}
            >
              Per Campagna
            </Button>
            <Button
              variant={cplGroupBy === "group" ? "default" : "outline"}
              size="sm"
              onClick={() => setCplGroupBy("group")}
            >
              Per Gruppo
            </Button>
          </div>
          <CplTable data={cplData ?? []} isLoading={cplLoading} groupBy={cplGroupBy} />
        </TabsContent>

        <TabsContent value="losses" className="space-y-4">
          <FunnelLossTable data={funnelLosses} isLoading={funnelLoading} />
        </TabsContent>

        <TabsContent value="funnel" className="space-y-4">
          <FunnelChart data={funnel} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="sources" className="space-y-4">
          <SourcePerformanceChart data={sources} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <TrendComparisonChart data={velocity} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
