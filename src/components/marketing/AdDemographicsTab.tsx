import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Users2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAdDemographics } from "@/hooks/useAdDemographics";
import { useAdPlatformStats } from "@/hooks/useAdPlatformStats";
import type { AdPlatform } from "@/types/adPlatform";

const GENDER_COLORS: Record<string, string> = {
  male: "hsl(var(--primary))",
  female: "hsl(var(--secondary))",
  unknown: "hsl(var(--muted-foreground))",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Uomini",
  female: "Donne",
  unknown: "Sconosciuto",
};

export function AdDemographicsTab() {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [platformFilter, setPlatformFilter] = useState<AdPlatform | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
    to: format(endOfMonth(selectedMonth), "yyyy-MM-dd"),
  }), [selectedMonth]);

  const platform = platformFilter === "all" ? null : platformFilter;
  const campaignId = campaignFilter === "all" ? null : campaignFilter;

  const { data: demographics, isLoading } = useAdDemographics({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
    campaignId,
  });

  const { data: allStats } = useAdPlatformStats({
    fromDate: dateRange.from,
    toDate: dateRange.to,
    platform,
  });

  const campaignOptions = useMemo(() => {
    if (!allStats?.length) return [];
    const unique = new Map<string, string>();
    for (const s of allStats) {
      const key = s.external_campaign_id;
      const label = s.campaign_name || s.external_campaign_name || key;
      if (!unique.has(key)) unique.set(key, label);
    }
    return Array.from(unique.entries()).map(([id, name]) => ({ id, name }));
  }, [allStats]);

  // Prepare chart data
  const ageGenderData = useMemo(() => {
    if (!demographics?.length) return [];
    const map = new Map<string, { age_range: string; male: number; female: number; unknown: number }>();
    for (const d of demographics) {
      const existing = map.get(d.age_range) || { age_range: d.age_range, male: 0, female: 0, unknown: 0 };
      const gender = d.gender as "male" | "female" | "unknown";
      existing[gender] = (existing[gender] || 0) + d.total_spend;
      map.set(d.age_range, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.age_range.localeCompare(b.age_range));
  }, [demographics]);

  const genderPieData = useMemo(() => {
    if (!demographics?.length) return [];
    const map = new Map<string, number>();
    for (const d of demographics) {
      map.set(d.gender, (map.get(d.gender) || 0) + d.total_impressions);
    }
    return Array.from(map.entries()).map(([gender, value]) => ({
      name: GENDER_LABELS[gender] || gender,
      value,
      color: GENDER_COLORS[gender] || "hsl(var(--accent))",
    }));
  }, [demographics]);

  const handlePrevMonth = () => setSelectedMonth((d) => subMonths(d, 1));
  const handleNextMonth = () => {
    setSelectedMonth((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label="Indietro">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center font-medium">
            {format(selectedMonth, "MMMM yyyy", { locale: it })}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth} aria-label="Avanti">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as AdPlatform | "all")}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Piattaforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="meta">Meta Ads</SelectItem>
          </SelectContent>
        </Select>

        {campaignOptions.length > 0 && (
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Campagna" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le campagne</SelectItem>
              {campaignOptions.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <div className="grid md:grid-cols-2 gap-6">
          <Card><CardContent className="h-[350px] flex items-center justify-center text-muted-foreground">Caricamento...</CardContent></Card>
          <Card><CardContent className="h-[350px] flex items-center justify-center text-muted-foreground">Caricamento...</CardContent></Card>
        </div>
      ) : !demographics?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">Nessun dato demografico disponibile</p>
            <p className="text-sm mt-1">Esegui una "Sync Storica" per importare i dati di genere e fascia d'età.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Age + Gender Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Spesa per Fascia d'Età e Genere</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={ageGenderData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="age_range" />
                    <YAxis />
                    <Tooltip formatter={(value: number) => `€${value.toLocaleString("it-IT", { maximumFractionDigits: 0 })}`} />
                    <Legend />
                    <Bar dataKey="male" name="Uomini" fill={GENDER_COLORS.male} stackId="a" />
                    <Bar dataKey="female" name="Donne" fill={GENDER_COLORS.female} stackId="a" />
                    <Bar dataKey="unknown" name="Sconosciuto" fill={GENDER_COLORS.unknown} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Gender Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Distribuzione Impression per Genere</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={genderPieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={100}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {genderPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => value.toLocaleString("it-IT")} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Detail Table */}
          <Card>
            <CardHeader>
              <CardTitle>Dettaglio Demografico</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Fascia d'Età</th>
                      <th className="text-left py-2">Genere</th>
                      <th className="text-right py-2">Spesa</th>
                      <th className="text-right py-2">Impression</th>
                      <th className="text-right py-2">Click</th>
                      <th className="text-right py-2">Reach</th>
                      <th className="text-right py-2">CTR</th>
                      <th className="text-right py-2">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {demographics.map((d, i) => (
                      <tr key={`${d.age_range}-${d.gender}-${i}`} className="border-b">
                        <td className="py-2">{d.age_range}</td>
                        <td className="py-2 capitalize">{GENDER_LABELS[d.gender] || d.gender}</td>
                        <td className="py-2 text-right">€{d.total_spend.toLocaleString("it-IT", { maximumFractionDigits: 0 })}</td>
                        <td className="py-2 text-right">{d.total_impressions.toLocaleString("it-IT")}</td>
                        <td className="py-2 text-right">{d.total_clicks.toLocaleString("it-IT")}</td>
                        <td className="py-2 text-right">{d.total_reach.toLocaleString("it-IT")}</td>
                        <td className="py-2 text-right">{d.ctr != null ? `${d.ctr}%` : "—"}</td>
                        <td className="py-2 text-right">{d.cpc != null ? `€${d.cpc.toFixed(2)}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
