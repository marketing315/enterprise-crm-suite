import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronLeft, ChevronRight, Megaphone } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";
import { useMarketingSummaryKpis, useMarketingChannelKpis } from "@/hooks/useMarketingKpis";
import { MarketingKpiCards } from "@/components/marketing/MarketingKpiCards";
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
  
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  
  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const { data: summaryKpis, isLoading: summaryLoading } = useMarketingSummaryKpis(
    dateRange.from,
    dateRange.to
  );
  
  const { data: channelKpis, isLoading: channelLoading } = useMarketingChannelKpis(
    dateRange.from,
    dateRange.to
  );

  const handlePrevMonth = () => setSelectedMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => setSelectedMonth((d) => {
    const next = new Date(d);
    next.setMonth(next.getMonth() + 1);
    return next;
  });

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

        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium">
            {format(selectedMonth, "MMMM yyyy", { locale: it })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <MarketingKpiCards kpis={summaryKpis} isLoading={summaryLoading} />

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ricavi vs Costi per Canale</CardTitle>
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
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value: number) => `€${value.toLocaleString("it-IT")}`}
                  />
                  <Legend />
                  <Bar dataKey="revenue" name="Ricavi" fill="hsl(var(--primary))" />
                  <Bar dataKey="cost" name="Costi" fill="hsl(var(--destructive))" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuzione Ricavi per Canale</CardTitle>
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
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {roiByChannel.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => `€${value.toLocaleString("it-IT")}`}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Channel Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Performance per Canale</CardTitle>
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
                    <th className="text-left py-2">Canale</th>
                    <th className="text-left py-2">Tipo</th>
                    <th className="text-right py-2">Campagne</th>
                    <th className="text-right py-2">Lead</th>
                    <th className="text-right py-2">Deal Vinti</th>
                    <th className="text-right py-2">Ricavi</th>
                    <th className="text-right py-2">Costi</th>
                    <th className="text-right py-2">ROI</th>
                  </tr>
                </thead>
                <tbody>
                  {channelKpis.map((ch) => (
                    <tr key={ch.channel_id} className="border-b">
                      <td className="py-2 font-medium">{ch.channel_name}</td>
                      <td className="py-2 capitalize">{ch.channel_type}</td>
                      <td className="py-2 text-right">{ch.campaigns_count}</td>
                      <td className="py-2 text-right">{ch.leads_count}</td>
                      <td className="py-2 text-right">{ch.deals_won}</td>
                      <td className="py-2 text-right">€{ch.revenue.toLocaleString("it-IT")}</td>
                      <td className="py-2 text-right">€{ch.marketing_cost.toLocaleString("it-IT")}</td>
                      <td className={`py-2 text-right font-medium ${ch.avg_roi >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {ch.avg_roi.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
