import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { MoreVertical, Pencil, Trash2, Copy } from "lucide-react";
import { CampaignStatusBadge } from "@/components/marketing/CampaignStatusBadge";
import type { MarketingCampaign, MarketingCampaignKpi, MarketingCampaignStatus } from "@/types/marketing";

interface CampaignsTableProps {
  campaigns: MarketingCampaign[] | undefined;
  kpis: MarketingCampaignKpi[] | undefined;
  isLoading: boolean;
  canEdit: boolean;
  onEdit: (c: MarketingCampaign) => void;
  onDelete: (c: MarketingCampaign) => void;
  onDuplicate: (c: MarketingCampaign) => void;
  onToggleActive: (c: MarketingCampaign, active: boolean) => void;
}

export function CampaignsTable({
  campaigns, kpis, isLoading, canEdit,
  onEdit, onDelete, onDuplicate, onToggleActive,
}: CampaignsTableProps) {
  const getKpi = (id: string) => kpis?.find((k) => k.campaign_id === id);

  const fmt = (v: number | null | undefined) =>
    v != null ? `€${v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lista Campagne</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Caricamento...</div>
        ) : !campaigns?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            Nessuna campagna trovata.{canEdit && " Crea la prima campagna per iniziare."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campagna</TableHead>
                  <TableHead>Canale</TableHead>
                  <TableHead>Stato</TableHead>
                  {canEdit && <TableHead className="text-center">On/Off</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Spend ADV</TableHead>
                  <TableHead className="text-right">Budget</TableHead>
                  <TableHead className="text-right">Lead</TableHead>
                  <TableHead className="text-right">CPL</TableHead>
                  <TableHead className="text-right">Deal Vinti</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  {canEdit && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => {
                  const kpi = getKpi(campaign.id);
                  const isActive = campaign.status === "active";
                  return (
                    <TableRow key={campaign.id} className={campaign.status === "paused" ? "opacity-60" : ""}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{campaign.name}</div>
                          {campaign.external_id && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {campaign.external_id}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{campaign.marketing_channels?.name || "—"}</TableCell>
                      <TableCell>
                        <CampaignStatusBadge status={campaign.status} />
                      </TableCell>
                      {canEdit && (
                        <TableCell className="text-center">
                          <Switch
                            checked={isActive}
                            onCheckedChange={(checked) => onToggleActive(campaign, checked)}
                            disabled={campaign.status === "closed"}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="text-sm whitespace-nowrap">
                          {format(new Date(campaign.start_date), "dd/MM/yy", { locale: it })}
                          {campaign.end_date && (
                            <> – {format(new Date(campaign.end_date), "dd/MM/yy", { locale: it })}</>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {fmt(kpi?.marketing_cost)}
                      </TableCell>
                      <TableCell className="text-right">
                        {campaign.planned_budget != null
                          ? `€${campaign.planned_budget.toLocaleString("it-IT")}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">{kpi?.leads_count ?? "—"}</TableCell>
                      <TableCell className="text-right">{kpi?.cpl != null ? fmt(kpi.cpl) : "—"}</TableCell>
                      <TableCell className="text-right">{kpi?.deals_won ?? "—"}</TableCell>
                      <TableCell className="text-right">{fmt(kpi?.revenue)}</TableCell>
                      <TableCell className={`text-right font-medium ${
                        kpi?.roi != null && kpi.roi >= 0 ? "text-green-600" : kpi?.roi != null ? "text-red-600" : ""
                      }`}>
                        {kpi?.roi != null ? `${kpi.roi.toFixed(1)}%` : "—"}
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
                              <DropdownMenuItem onClick={() => onEdit(campaign)}>
                                <Pencil className="h-4 w-4 mr-2" /> Modifica
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDuplicate(campaign)}>
                                <Copy className="h-4 w-4 mr-2" /> Duplica
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => onDelete(campaign)} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" /> Elimina
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
  );
}
