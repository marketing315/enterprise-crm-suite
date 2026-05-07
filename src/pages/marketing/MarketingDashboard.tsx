import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subDays, differenceInDays, subMilliseconds } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CalendarIcon, Megaphone, BarChart3, Image as ImageIcon, Users2, Globe, Mail, Building2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { useBrand, SYSTEM_BRAND_ID } from "@/contexts/BrandContext";
import { CustomReportDialog } from "@/components/marketing/CustomReportDialog";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { useMarketingSummaryKpis, useMarketingChannelKpis } from "@/hooks/useMarketingKpis";
import { useAdPlatformStatsSummary } from "@/hooks/useAdPlatformStats";
import { useFunnelMetrics } from "@/hooks/useFunnelMetrics";
import { useFunnelOverview } from "@/hooks/useFunnelOverview";
import { useFunnelOverviewCompare } from "@/hooks/useFunnelOverviewCompare";
import { useLeadsBySourceDay, type LeadHistogramGranularity } from "@/hooks/useLeadsBySourceDay";
import { useEmailCampaignKpis } from "@/hooks/useEmailCampaignKpis";
import { usePortfolioKpis } from "@/hooks/usePortfolioKpis";
import { MarketingKpiCards } from "@/components/marketing/MarketingKpiCards";
import { FunnelCrossStage } from "@/components/marketing/FunnelCrossStage";
import { FunnelStageDrillPanel } from "@/components/marketing/FunnelStageDrillPanel";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LeadsHistogram } from "@/components/marketing/LeadsHistogram";
import { EmailCampaignsCard } from "@/components/marketing/EmailCampaignsCard";
import { AutomationDonut } from "@/components/marketing/AutomationDonut";
import { PortfolioBrandTable } from "@/components/marketing/PortfolioBrandTable";
import { AdStatsTab } from "@/components/marketing/AdStatsTab";
import { AdCreativesTab } from "@/components/marketing/AdCreativesTab";
import { AdDemographicsTab } from "@/components/marketing/AdDemographicsTab";
import { Ga4StatsTab } from "@/components/marketing/Ga4StatsTab";
import { formatPercent, getPercentColorClass } from "@/lib/formatKpi";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

export default function MarketingDashboard() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  
  const [selectedRange, setSelectedRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [activeTab, setActiveTab] = useState("overview");
  
  const dateRange = useMemo(() => ({
    from: selectedRange?.from ? format(selectedRange.from, "yyyy-MM-dd") : format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: selectedRange?.to ? format(selectedRange.to, "yyyy-MM-dd") : format(endOfMonth(new Date()), "yyyy-MM-dd"),
  }), [selectedRange]);

  const { data: summaryKpis, isLoading: summaryLoading } = useMarketingSummaryKpis(
    dateRange.from,
    dateRange.to
  );
  
  const { data: channelKpis, isLoading: channelLoading } = useMarketingChannelKpis(
    dateRange.from,
    dateRange.to
  );

  // ADV summary for the same period
  const { data: advSummary, isLoading: advLoading } = useAdPlatformStatsSummary({
    fromDate: dateRange.from,
    toDate: dateRange.to,
  });

  // Funnel metrics for the same period
  const funnelFrom = useMemo(() => selectedRange?.from ?? startOfMonth(new Date()), [selectedRange]);
  const funnelTo = useMemo(() => selectedRange?.to ?? endOfMonth(new Date()), [selectedRange]);
  const { metrics: funnelMetrics, isLoading: funnelLoading } = useFunnelMetrics({
    from: funnelFrom,
    to: funnelTo,
  });

  // New cross-stage funnel + histogram + email + portfolio
  const fromIso = useMemo(() => funnelFrom.toISOString(), [funnelFrom]);
  const toIso = useMemo(() => funnelTo.toISOString(), [funnelTo]);
  const { data: funnelOverview, isLoading: funnelOvLoading } = useFunnelOverview(fromIso, toIso);

  const [histGranularity, setHistGranularity] = useState<LeadHistogramGranularity>("day");
  const { data: histData, isLoading: histLoading } = useLeadsBySourceDay(fromIso, toIso, histGranularity);

  const { data: emailKpis, isLoading: emailLoading } = useEmailCampaignKpis(fromIso, toIso);

  const isSystemBrand = currentBrand?.id === SYSTEM_BRAND_ID;
  const { data: portfolioData, isLoading: portfolioLoading } = usePortfolioKpis(
    dateRange.from,
    dateRange.to,
    isSystemBrand
  );

  const handlePreset = (days: number) => {
    setSelectedRange({ from: subDays(new Date(), days), to: new Date() });
  };
  const handleThisMonth = () => {
    setSelectedRange({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) });
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar per visualizzare il marketing.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Non hai i permessi per accedere a questa sezione.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const revenueByChannel = channelKpis?.map((ch) => ({
    name: ch.channel_name,
    revenue: ch.revenue,
    cost: ch.marketing_cost,
  })) || [];

  const roiByChannel = channelKpis?.map((ch) => ({
    name: ch.channel_name,
    value: ch.revenue,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Marketing Dashboard
          </h1>
          <p className="text-muted-foreground">
            Performance marketing per {currentBrand?.name}
          </p>
        </div>
        <CustomReportDialog />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="adv" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Statistiche ADV
          </TabsTrigger>
          <TabsTrigger value="creatives" className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Creatives
          </TabsTrigger>
          <TabsTrigger value="demographics" className="flex items-center gap-2">
            <Users2 className="h-4 w-4" />
            Demographics
          </TabsTrigger>
          <TabsTrigger value="website" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Sito Web
          </TabsTrigger>
          <TabsTrigger value="email" className="flex items-center gap-2">
            <Mail className="h-4 w-4" />
            Email & Automation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-6">
          {/* Date Range Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "justify-start text-left font-normal",
                    !selectedRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedRange?.from ? (
                    selectedRange.to ? (
                      <>
                        {format(selectedRange.from, "d MMM", { locale: it })} –{" "}
                        {format(selectedRange.to, "d MMM yyyy", { locale: it })}
                      </>
                    ) : (
                      format(selectedRange.from, "d MMM yyyy", { locale: it })
                    )
                  ) : (
                    <span>Seleziona periodo</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={selectedRange?.from}
                  selected={selectedRange}
                  onSelect={setSelectedRange}
                  numberOfMonths={2}
                  locale={it}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={() => handlePreset(7)}>7gg</Button>
            <Button variant="outline" size="sm" onClick={() => handlePreset(30)}>30gg</Button>
            <Button variant="outline" size="sm" onClick={() => handlePreset(90)}>90gg</Button>
            <Button variant="outline" size="sm" onClick={handleThisMonth}>Mese</Button>
          </div>

          {/* KPI Cards (with ADV metrics integrated) */}
          <MarketingKpiCards
            kpis={summaryKpis}
            advSummary={advSummary}
            funnelMetrics={funnelMetrics}
            isLoading={summaryLoading || advLoading || funnelLoading}
          />

          {/* Cross-stage end-to-end funnel */}
          <FunnelCrossStage stages={funnelOverview} isLoading={funnelOvLoading} />

          {/* Stacked histogram leads-by-source */}
          <LeadsHistogram
            data={histData}
            isLoading={histLoading}
            granularity={histGranularity}
            onGranularityChange={setHistGranularity}
          />

          {/* Portfolio cross-brand (system brand only) */}
          {isSystemBrand && (
            <PortfolioBrandTable data={portfolioData} isLoading={portfolioLoading} />
          )}

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Ricavi vs Costi per Canale</CardTitle>
              </CardHeader>
              <CardContent>
                {channelLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Caricamento...
                  </div>
                ) : revenueByChannel.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={revenueByChannel}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        formatter={(value: number) => `€${value.toLocaleString("it-IT")}`}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                      <Legend />
                      <Bar dataKey="revenue" name="Ricavi" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="cost" name="Costi" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-0 shadow-sm">
              <CardHeader>
                <CardTitle className="text-base">Distribuzione Ricavi per Canale</CardTitle>
              </CardHeader>
              <CardContent>
                {channelLoading ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Caricamento...
                  </div>
                ) : roiByChannel.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    Nessun dato disponibile
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={roiByChannel}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        outerRadius={100}
                        innerRadius={50}
                        fill="#8884d8"
                        dataKey="value"
                        strokeWidth={2}
                      >
                        {roiByChannel.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        formatter={(value: number) => `€${value.toLocaleString("it-IT")}`}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Channel Summary Table */}
          <Card className="border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Performance per Canale</CardTitle>
            </CardHeader>
            <CardContent>
              {channelLoading ? (
                <div className="h-20 flex items-center justify-center text-muted-foreground">
                  Caricamento...
                </div>
              ) : !channelKpis?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nessun canale configurato. Crea campagne per vedere i dati.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium text-muted-foreground">Canale</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Tipo</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Campagne</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Lead</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Deal Vinti</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Ricavi</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">Costi</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">ROI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channelKpis.map((ch) => (
                        <tr key={ch.channel_id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                          <td className="py-2.5 font-medium">{ch.channel_name}</td>
                          <td className="py-2.5 capitalize text-muted-foreground">{ch.channel_type}</td>
                          <td className="py-2.5 text-right">{ch.campaigns_count}</td>
                          <td className="py-2.5 text-right">{ch.leads_count}</td>
                          <td className="py-2.5 text-right">{ch.deals_won}</td>
                          <td className="py-2.5 text-right">€{ch.revenue.toLocaleString("it-IT")}</td>
                          <td className="py-2.5 text-right">€{ch.marketing_cost.toLocaleString("it-IT")}</td>
                          <td className={`py-2.5 text-right font-medium ${getPercentColorClass(ch.avg_roi)}`}>
                            {formatPercent(ch.avg_roi)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="adv" className="mt-6">
          <AdStatsTab />
        </TabsContent>

        <TabsContent value="creatives" className="mt-6">
          <AdCreativesTab />
        </TabsContent>

        <TabsContent value="demographics" className="mt-6">
          <AdDemographicsTab />
        </TabsContent>

        <TabsContent value="website" className="mt-6">
          <Ga4StatsTab fromDate={dateRange.from} toDate={dateRange.to} />
        </TabsContent>

        <TabsContent value="email" className="mt-6 space-y-6">
          <EmailCampaignsCard data={emailKpis} isLoading={emailLoading} />
          <AutomationDonut fromIso={fromIso} toIso={toIso} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
