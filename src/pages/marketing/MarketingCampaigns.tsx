import { useState, useMemo } from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Plus, MoreVertical, Pencil, Trash2, Play, Pause } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useHasMarketingAccess, useCanEditCampaigns } from "@/hooks/useMarketingAccess";
import { useMarketingCampaigns, useUpdateMarketingCampaign, useDeleteMarketingCampaign } from "@/hooks/useMarketingCampaigns";
import { useMarketingCampaignKpis } from "@/hooks/useMarketingKpis";
import { CampaignFormDrawer } from "@/components/marketing/CampaignFormDrawer";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
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

  const { data: campaigns, isLoading } = useMarketingCampaigns({
    status: statusFilter,
    channelId: channelFilter || undefined,
  });

  const dateRange = useMemo(() => ({
    from: format(startOfMonth(new Date()), "yyyy-MM-dd"),
    to: format(endOfMonth(new Date()), "yyyy-MM-dd"),
  }), []);

  const { data: kpis } = useMarketingCampaignKpis({
    fromDate: dateRange.from,
    toDate: dateRange.to,
  });

  const updateCampaign = useUpdateMarketingCampaign();
  const deleteCampaign = useDeleteMarketingCampaign();

  const getKpiForCampaign = (campaignId: string) => {
    return kpis?.find((k) => k.campaign_id === campaignId);
  };

  const handleEdit = (campaign: MarketingCampaign) => {
    setSelectedCampaign(campaign);
    setDrawerOpen(true);
  };

  const handleCreate = () => {
    setSelectedCampaign(null);
    setDrawerOpen(true);
  };

  const handleStatusChange = async (campaign: MarketingCampaign, newStatus: MarketingCampaignStatus) => {
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, status: newStatus });
      toast.success(`Campagna ${newStatus === "active" ? "attivata" : newStatus === "paused" ? "messa in pausa" : "aggiornata"}`);
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

  if (!hasBrandSelected) {
    return (
      <div className="p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Seleziona un brand dalla sidebar.
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Campagne Marketing</h1>
          <p className="text-muted-foreground">
            Gestisci le campagne per {currentBrand?.name}
          </p>
        </div>

        {canEdit && (
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nuova Campagna
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4">
            <div className="w-48">
              <ChannelSelect
                value={channelFilter}
                onValueChange={setChannelFilter}
                placeholder="Tutti i canali"
                allowEmpty
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={statusFilter === undefined ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(undefined)}
              >
                Tutte
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("active")}
              >
                Attive
              </Button>
              <Button
                variant={statusFilter === "planned" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("planned")}
              >
                Pianificate
              </Button>
              <Button
                variant={statusFilter === "paused" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("paused")}
              >
                In Pausa
              </Button>
              <Button
                variant={statusFilter === "closed" ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter("closed")}
              >
                Chiuse
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Lista Campagne</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
          ) : !campaigns?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              Nessuna campagna trovata.
              {canEdit && " Crea la prima campagna per iniziare."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campagna</TableHead>
                    <TableHead>Canale</TableHead>
                    <TableHead>Stato</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Budget</TableHead>
                    <TableHead className="text-right">Lead</TableHead>
                    <TableHead className="text-right">Deal Vinti</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                    {canEdit && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => {
                    const kpi = getKpiForCampaign(campaign.id);
                    return (
                      <TableRow key={campaign.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{campaign.name}</div>
                            {campaign.external_id && (
                              <div className="text-xs text-muted-foreground">
                                ID: {campaign.external_id}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {campaign.marketing_channels?.name || "—"}
                        </TableCell>
                        <TableCell>
                          <CampaignStatusBadge status={campaign.status} />
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {format(new Date(campaign.start_date), "dd/MM/yyyy", { locale: it })}
                            {campaign.end_date && (
                              <> - {format(new Date(campaign.end_date), "dd/MM/yyyy", { locale: it })}</>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {campaign.planned_budget
                            ? `€${campaign.planned_budget.toLocaleString("it-IT")}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {kpi?.leads_count ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {kpi?.deals_won ?? "—"}
                        </TableCell>
                        <TableCell className={`text-right font-medium ${
                          kpi && kpi.roi != null && kpi.roi >= 0 ? "text-green-600" : kpi && kpi.roi != null ? "text-red-600" : ""
                        }`}>
                          {kpi && kpi.roi != null ? `${kpi.roi.toFixed(1)}%` : "—"}
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEdit(campaign)}>
                                  <Pencil className="h-4 w-4 mr-2" />
                                  Modifica
                                </DropdownMenuItem>
                                {campaign.status !== "active" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(campaign, "active")}>
                                    <Play className="h-4 w-4 mr-2" />
                                    Attiva
                                  </DropdownMenuItem>
                                )}
                                {campaign.status === "active" && (
                                  <DropdownMenuItem onClick={() => handleStatusChange(campaign, "paused")}>
                                    <Pause className="h-4 w-4 mr-2" />
                                    Metti in Pausa
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  onClick={() => handleDelete(campaign)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Elimina
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <CampaignFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        campaign={selectedCampaign}
      />
    </div>
  );
}
