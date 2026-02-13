import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Plus, Search } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess, useCanEditCampaigns } from "@/hooks/useMarketingAccess";
import {
  useMarketingCampaigns,
  useUpdateMarketingCampaign,
  useDeleteMarketingCampaign,
  useCreateMarketingCampaign,
} from "@/hooks/useMarketingCampaigns";
import { useMarketingCampaignKpis } from "@/hooks/useMarketingKpis";
import { CampaignFormDrawer } from "@/components/marketing/CampaignFormDrawer";
import { CampaignKpiCards } from "@/components/marketing/CampaignKpiCards";
import { CampaignsTable } from "@/components/marketing/CampaignsTable";
import { ChannelSelect } from "@/components/marketing/ChannelSelect";
import { toast } from "sonner";
import type { MarketingCampaign, MarketingCampaignStatus } from "@/types/marketing";

export default function MarketingCampaigns() {
  const { currentBrand, hasBrandSelected } = useBrand();
  const hasAccess = useHasMarketingAccess();
  const canEdit = useCanEditCampaigns();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [statusFilter, setStatusFilter] = useState<MarketingCampaignStatus | undefined>();
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(subMonths(new Date(), 2)), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), "yyyy-MM-dd"));

  const { data: campaigns, isLoading } = useMarketingCampaigns({
    status: statusFilter,
    channelId: channelFilter || undefined,
  });

  const { data: kpis, isLoading: kpisLoading } = useMarketingCampaignKpis({
    fromDate: dateFrom,
    toDate: dateTo,
  });

  const updateCampaign = useUpdateMarketingCampaign();
  const deleteCampaign = useDeleteMarketingCampaign();
  const createCampaign = useCreateMarketingCampaign();

  // Client-side search + hide campaigns with no spend
  const filteredCampaigns = useMemo(() => {
    if (!campaigns) return [];
    return campaigns.filter((c) => {
      // Hide campaigns with zero spend ADV
      const kpi = kpis?.find((k) => k.campaign_id === c.id);
      if (!kpi || (kpi.marketing_cost ?? 0) === 0) return false;
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.external_id?.toLowerCase().includes(q) ||
          c.marketing_channels?.name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [campaigns, searchQuery, kpis]);

  const handleEdit = (campaign: MarketingCampaign) => {
    setSelectedCampaign(campaign);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setDrawerOpen(true);
  };

  const handleToggleActive = async (campaign: MarketingCampaign, active: boolean) => {
    const newStatus: MarketingCampaignStatus = active ? "active" : "paused";
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, status: newStatus });
      toast.success(active ? "Campagna attivata" : "Campagna messa in pausa");
    } catch {
      toast.error("Errore nell'aggiornamento");
    }
  };

  const handleDelete = async (campaign: MarketingCampaign) => {
    if (!confirm(`Eliminare la campagna "${campaign.name}"?`)) return;
    try {
      await deleteCampaign.mutateAsync(campaign.id);
      toast.success("Campagna eliminata");
    } catch {
      toast.error("Errore nell'eliminazione");
    }
  };

  const handleDuplicate = async (campaign: MarketingCampaign) => {
    try {
      await createCampaign.mutateAsync({
        name: `${campaign.name} (copia)`,
        channel_id: campaign.channel_id,
        external_id: null,
        start_date: format(new Date(), "yyyy-MM-dd"),
        end_date: null,
        planned_budget: campaign.planned_budget,
        status: "planned",
      });
      toast.success("Campagna duplicata");
    } catch {
      toast.error("Errore nella duplicazione");
    }
  };

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Seleziona un brand dalla sidebar.</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Non hai i permessi per accedere a questa sezione.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campagne Marketing</h1>
          <p className="text-muted-foreground">
            Gestisci le campagne per {currentBrand?.name}
          </p>
        </div>
        {canEdit && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" /> Nuova Campagna
          </Button>
        )}
      </div>

      {/* KPI Summary Cards */}
      <CampaignKpiCards kpis={kpis} isLoading={kpisLoading} />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Search */}
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca campagna..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Channel filter */}
            <div className="w-48">
              <ChannelSelect
                value={channelFilter}
                onValueChange={setChannelFilter}
                placeholder="Tutti i canali"
                allowEmpty
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36"
              />
            </div>

            {/* Status filter */}
            <div className="flex gap-1.5">
              {([
                [undefined, "Tutte"],
                ["active", "Attive"],
                ["planned", "Pianificate"],
                ["paused", "In Pausa"],
                ["closed", "Chiuse"],
              ] as const).map(([val, label]) => (
                <Button
                  key={label}
                  variant={statusFilter === val ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(val as MarketingCampaignStatus | undefined)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <CampaignsTable
        campaigns={filteredCampaigns}
        kpis={kpis}
        isLoading={isLoading}
        canEdit={canEdit}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onToggleActive={handleToggleActive}
      />

      <CampaignFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        campaign={selectedCampaign}
      />
    </div>
  );
}
