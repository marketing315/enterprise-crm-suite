import { useNavigate } from "react-router-dom";
import { formatDistanceToNow, format } from "date-fns";
import { it } from "date-fns/locale";
import {
  User,
  Clock,
  DollarSign,
  ExternalLink,
  Trophy,
  XCircle,
  Archive,
  Tag,
  Calendar,
  UserCheck,
  ShoppingCart,
  Lock,
  Megaphone,
  Package,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityTagList } from "@/components/tags/EntityTagList";
import { EntityChatBox } from "@/components/chat/EntityChatBox";
import { SalespersonAssignmentSelect } from "@/components/team/SalespersonAssignmentSelect";
import { CampaignSelect } from "./CampaignSelect";
import { useUpdateDealStatus, useAssignDealToUser, useUpdateDealCampaign } from "@/hooks/usePipeline";
import { useDealSalesOrder, useCreateSalesOrderFromDeal } from "@/hooks/useSalesOrders";
import { useSalesOrderItems } from "@/hooks/useSalesOrderItems";
import { useCanEditDeals } from "@/hooks/useCanEditDeals";
import { useHasMarketingAccess, useCanEditCampaigns } from "@/hooks/useMarketingAccess";
import { toast } from "sonner";
import type { DealStatus } from "@/types/database";
import type { DealWithContactAndTags } from "@/hooks/usePipeline";

interface DealDetailSheetProps {
  deal: DealWithContactAndTags | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DealDetailSheet({
  deal,
  open,
  onOpenChange,
}: DealDetailSheetProps) {
  const navigate = useNavigate();
  const updateStatus = useUpdateDealStatus();
  const assignDeal = useAssignDealToUser();
  const updateCampaign = useUpdateDealCampaign();
  const { data: existingSalesOrder } = useDealSalesOrder(deal?.id || null);
  const { data: orderItems = [] } = useSalesOrderItems(existingSalesOrder?.id || null);
  const createSalesOrder = useCreateSalesOrderFromDeal();
  const canEdit = useCanEditDeals();
  const hasMarketingAccess = useHasMarketingAccess();
  const canEditCampaigns = useCanEditCampaigns();

  if (!deal) return null;

  const handleAssignmentChange = (userId: string | null) => {
    assignDeal.mutate(
      { dealId: deal.id, userId, dealBrandId: deal.brand_id },
      {
        onSuccess: () => {
          toast.success(userId ? "Venditore assegnato" : "Assegnazione rimossa");
        },
        onError: () => {
          toast.error("Errore nell'assegnazione");
        },
      }
    );
  };

  const handleCampaignChange = (campaignId: string | null) => {
    updateCampaign.mutate(
      { dealId: deal.id, campaignId, dealBrandId: deal.brand_id },
      {
        onSuccess: () => {
          toast.success(campaignId ? "Campagna assegnata" : "Campagna rimossa");
        },
        onError: () => {
          toast.error("Errore nell'assegnazione campagna");
        },
      }
    );
  };

  const handleCreateSalesOrder = async () => {
    try {
      const orderId = await createSalesOrder.mutateAsync(deal.id);
      if (orderId) {
        navigate("/sales");
      }
    } catch (error) {
      // Error already handled by mutation
    }
  };

  const getContactName = () => {
    if (!deal.contact) return "—";
    const { first_name, last_name, email } = deal.contact;
    if (first_name || last_name) {
      return `${first_name || ""} ${last_name || ""}`.trim();
    }
    return email || "—";
  };

  const handleStatusChange = (status: DealStatus) => {
    updateStatus.mutate(
      { dealId: deal.id, status, dealBrandId: deal.brand_id },
      {
        onSuccess: () => {
          const labels: Record<DealStatus, string> = {
            open: "Aperto",
            won: "Vinto",
            lost: "Perso",
            closed: "Archiviato",
            reopened_for_support: "Riaperto",
          };
          toast.success(`Deal marcato come "${labels[status]}"`);
        },
        onError: () => {
          toast.error("Errore nell'aggiornamento");
        },
      }
    );
  };

  const statusColors: Record<string, string> = {
    open: "bg-primary/10 text-primary border-primary/30",
    won: "bg-green-500/10 text-green-700 border-green-300",
    lost: "bg-destructive/10 text-destructive border-destructive/30",
    closed: "bg-muted text-muted-foreground",
    reopened_for_support: "bg-amber-500/10 text-amber-700 border-amber-300",
  };

  const statusLabels: Record<string, string> = {
    open: "Aperto",
    won: "Vinto",
    lost: "Perso",
    closed: "Chiuso",
    reopened_for_support: "Riaperto",
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:w-[500px] sm:max-w-[600px] flex flex-col p-4 sm:p-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-base sm:text-lg">
            <User className="h-5 w-5" />
            <span className="truncate">{getContactName()}</span>
            <Badge variant="outline" className={statusColors[deal.status]}>
              {statusLabels[deal.status]}
            </Badge>
          </SheetTitle>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              Aggiornato{" "}
              {formatDistanceToNow(new Date(deal.updated_at), {
                locale: it,
                addSuffix: true,
              })}
            </span>
          </div>
        </SheetHeader>

        <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details">Dettagli</TabsTrigger>
            <TabsTrigger value="chat">Discussione</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-hidden mt-4">
            <ScrollArea className="h-full -mx-6 px-6">
              <div className="space-y-6 pb-4">
                {/* Read-only notice for amministrazione */}
                {!canEdit && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                    <Lock className="h-4 w-4" />
                    <span>Modalità sola lettura</span>
                  </div>
                )}

                {/* Quick Actions - Hidden for read-only users */}
                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {deal.status === "open" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange("won")}
                          className="text-green-700 border-green-300 hover:bg-green-50"
                        >
                          <Trophy className="h-4 w-4 mr-1" />
                          Vinto
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange("lost")}
                          className="text-destructive border-destructive/30 hover:bg-destructive/10"
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Perso
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange("closed")}
                        >
                          <Archive className="h-4 w-4 mr-1" />
                          Archivia
                        </Button>
                      </>
                    )}
                    {(deal.status === "won" ||
                      deal.status === "lost" ||
                      deal.status === "closed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStatusChange("open")}
                      >
                        Riapri Deal
                      </Button>
                    )}
                  </div>
                )}

                {/* Contact Info */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contatto
                    </h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/contacts?open=${deal.contact_id}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5 mr-1" />
                      Apri
                    </Button>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="font-medium">{getContactName()}</p>
                    {deal.contact?.email && (
                      <p className="text-muted-foreground">{deal.contact.email}</p>
                    )}
                  </div>
                </div>

                {/* Salesperson Assignment - Disabled for read-only */}
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <UserCheck className="h-4 w-4" />
                    Assegnato a
                  </h4>
                  <SalespersonAssignmentSelect
                    value={(deal as any).assigned_user_id || null}
                    onChange={handleAssignmentChange}
                    disabled={assignDeal.isPending || !canEdit}
                  />
                </div>

                {/* Value */}
                {deal.value && (
                  <div className="rounded-lg border p-4">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4 text-green-600" />
                      <span className="font-medium">Valore Deal</span>
                    </div>
                    <p className="text-2xl font-bold text-green-700 mt-1">
                      €{deal.value.toLocaleString("it-IT")}
                    </p>
                  </div>
                )}

                {/* Marketing Campaign Attribution */}
                {hasMarketingAccess && (
                  <div className="rounded-lg border p-4">
                    <h4 className="font-medium flex items-center gap-2 mb-3">
                      <Megaphone className="h-4 w-4" />
                      Campagna Marketing
                    </h4>
                    <CampaignSelect
                      value={deal.marketing_campaign_id || null}
                      onChange={handleCampaignChange}
                      disabled={updateCampaign.isPending || !canEdit || !canEditCampaigns}
                    />
                    {deal.marketing_campaign && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Attribuzione per calcolo ROI e KPI marketing
                      </p>
                    )}
                  </div>
                )}

                {/* Sales Order */}
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <ShoppingCart className="h-4 w-4" />
                    Vendita
                  </h4>
                  {existingSalesOrder ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{existingSalesOrder.order_number}</p>
                          <p className="text-sm text-muted-foreground">
                            €{existingSalesOrder.total_amount.toLocaleString("it-IT")}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate("/sales")}
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" />
                          Apri
                        </Button>
                      </div>

                      {/* Products Sold Detail */}
                      {orderItems.length > 0 && (
                        <div className="border-t pt-3 mt-3">
                          <h5 className="text-sm font-medium flex items-center gap-2 mb-2 text-muted-foreground">
                            <Package className="h-3.5 w-3.5" />
                            Prodotti venduti
                          </h5>
                          <div className="space-y-2">
                            {orderItems.map((item) => (
                              <div
                                key={item.id}
                                className="flex items-start justify-between text-sm bg-muted/50 rounded-md px-3 py-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">
                                    {item.product?.name || item.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {item.quantity} × €{item.unit_price.toLocaleString("it-IT")}
                                    {item.discount_percent && item.discount_percent > 0 && (
                                      <span className="ml-1 text-primary">
                                        (-{item.discount_percent}%)
                                      </span>
                                    )}
                                  </p>
                                </div>
                                <p className="font-medium text-right ml-2">
                                  €{item.line_total.toLocaleString("it-IT")}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : deal.status === "won" ? (
                    <Button
                      onClick={handleCreateSalesOrder}
                      disabled={createSalesOrder.isPending}
                      className="w-full"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {createSalesOrder.isPending ? "Creazione..." : "Crea Vendita"}
                    </Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Segna il deal come "Vinto" per creare una vendita
                    </p>
                  )}
                </div>

                {/* Tags */}
                <div className="rounded-lg border p-4">
                  <h4 className="font-medium flex items-center gap-2 mb-3">
                    <Tag className="h-4 w-4" />
                    Tag
                  </h4>
                  <EntityTagList entityType="deal" entityId={deal.id} scope="deal" />
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Creato</p>
                      <p className="font-medium">
                        {format(new Date(deal.created_at), "dd MMM yyyy", {
                          locale: it,
                        })}
                      </p>
                    </div>
                  </div>
                  {deal.closed_at && (
                    <div className="flex items-center gap-2">
                      <Archive className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-muted-foreground">Chiuso</p>
                        <p className="font-medium">
                          {format(new Date(deal.closed_at), "dd MMM yyyy", {
                            locale: it,
                          })}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {deal.notes && (
                  <>
                    <Separator />
                    <div>
                      <h4 className="font-medium mb-2">Note</h4>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {deal.notes}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="chat" className="flex-1 overflow-hidden mt-4">
            <EntityChatBox
              entityType="deal"
              entityId={deal.id}
              className="h-full"
            />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
