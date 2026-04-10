import { useState } from "react";
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
  Phone,
  Ticket,
  X,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EntityTagList } from "@/components/tags/EntityTagList";
import { EntityChatBox } from "@/components/chat/EntityChatBox";
import { AuditTimeline } from "@/components/audit/AuditTimeline";
import { SalespersonAssignmentSelect } from "@/components/team/SalespersonAssignmentSelect";
import { CampaignSelect } from "./CampaignSelect";
import { ClickToCallButton } from "@/components/contacts/ClickToCallButton";
import { useUpdateDealStatus, useAssignDealToUser, useUpdateDealCampaign } from "@/hooks/usePipeline";
import { useDealSalesOrder, useCreateSalesOrderFromDeal } from "@/hooks/useSalesOrders";
import { useSalesOrderItems } from "@/hooks/useSalesOrderItems";
import { useCanEditDeals } from "@/hooks/useCanEditDeals";
import { useHasMarketingAccess, useCanEditCampaigns } from "@/hooks/useMarketingAccess";
import { useContactPhone } from "@/hooks/useContacts";
import { CreateTicketDialog } from "@/components/tickets/CreateTicketDialog";
import { toast } from "sonner";
import type { DealStatus } from "@/types/database";
import type { DealWithContactAndTags } from "@/hooks/usePipeline";

interface DealInlinePanelProps {
  deal: DealWithContactAndTags | null;
  onClose: () => void;
}

export function DealInlinePanel({ deal, onClose }: DealInlinePanelProps) {
  const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
  const navigate = useNavigate();
  const updateStatus = useUpdateDealStatus();
  const assignDeal = useAssignDealToUser();
  const updateCampaign = useUpdateDealCampaign();
  const { data: existingSalesOrder } = useDealSalesOrder(deal?.id || null);
  const { data: orderItems = [] } = useSalesOrderItems(existingSalesOrder?.id || null);
  const { data: contactPhone } = useContactPhone(deal?.contact_id || null);
  const createSalesOrder = useCreateSalesOrderFromDeal();
  const canEdit = useCanEditDeals();
  const hasMarketingAccess = useHasMarketingAccess();
  const canEditCampaigns = useCanEditCampaigns();

  if (!deal) return null;

  const handleAssignmentChange = (userId: string | null) => {
    assignDeal.mutate(
      { dealId: deal.id, userId, dealBrandId: deal.brand_id },
      {
        onSuccess: () => toast.success(userId ? "Venditore assegnato" : "Assegnazione rimossa"),
        onError: () => toast.error("Errore nell'assegnazione"),
      }
    );
  };

  const handleCampaignChange = (campaignId: string | null) => {
    updateCampaign.mutate(
      { dealId: deal.id, campaignId, dealBrandId: deal.brand_id },
      {
        onSuccess: () => toast.success(campaignId ? "Campagna assegnata" : "Campagna rimossa"),
        onError: () => toast.error("Errore nell'assegnazione campagna"),
      }
    );
  };

  const handleCreateSalesOrder = async () => {
    try {
      const orderId = await createSalesOrder.mutateAsync(deal.id);
      if (orderId) navigate("/sales");
    } catch {}
  };

  const getContactName = () => {
    if (!deal.contact) return "—";
    const { first_name, last_name, email } = deal.contact;
    if (first_name || last_name) return `${first_name || ""} ${last_name || ""}`.trim();
    return email || "—";
  };

  const handleStatusChange = (status: DealStatus) => {
    updateStatus.mutate(
      { dealId: deal.id, status, dealBrandId: deal.brand_id },
      {
        onSuccess: () => {
          const labels: Record<DealStatus, string> = {
            open: "Aperto", won: "Vinto", lost: "Perso", closed: "Archiviato", reopened_for_support: "Riaperto",
          };
          toast.success(`Deal marcato come "${labels[status]}"`);
        },
        onError: () => toast.error("Errore nell'aggiornamento"),
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
    open: "Aperto", won: "Vinto", lost: "Perso", closed: "Chiuso", reopened_for_support: "Riaperto",
  };

  return (
    <div className="w-[380px] shrink-0 border-l bg-background flex flex-col h-full overflow-hidden animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-semibold text-sm truncate">{getContactName()}</span>
          <Badge variant="outline" className={`text-[10px] shrink-0 ${statusColors[deal.status]}`}>
            {statusLabels[deal.status]}
          </Badge>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="details" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 pt-2 shrink-0">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="details" className="text-xs">Dettagli</TabsTrigger>
            <TabsTrigger value="chat" className="text-xs">Discussione</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs flex items-center gap-1">
              <History className="h-3 w-3" />
              Audit
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details" className="flex-1 overflow-hidden mt-2">
          <ScrollArea className="h-full">
            <div className="space-y-4 px-4 pb-4">
              {/* Read-only notice */}
              {!canEdit && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                  <Lock className="h-3.5 w-3.5" />
                  <span>Modalità sola lettura</span>
                </div>
              )}

              {/* Quick Actions */}
              {canEdit && (
                <div className="flex flex-wrap gap-1.5">
                  {deal.status === "open" && (
                    <>
                      <Button variant="outline" size="sm" className="h-7 text-xs text-green-700 border-green-300 hover:bg-green-50" onClick={() => handleStatusChange("won")}>
                        <Trophy className="h-3.5 w-3.5 mr-1" /> Vinto
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleStatusChange("lost")}>
                        <XCircle className="h-3.5 w-3.5 mr-1" /> Perso
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleStatusChange("closed")}>
                        <Archive className="h-3.5 w-3.5 mr-1" /> Archivia
                      </Button>
                    </>
                  )}
                  {(deal.status === "won" || deal.status === "lost" || deal.status === "closed") && (
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleStatusChange("open")}>
                      Riapri Deal
                    </Button>
                  )}
                </div>
              )}

              {/* Open Ticket */}
              <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setTicketDialogOpen(true)}>
                <Ticket className="h-3.5 w-3.5 mr-1.5" /> Apri Ticket Supporto
              </Button>

              {/* Contact */}
              <div className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" /> Contatto
                  </h4>
                  <div className="flex items-center gap-0.5">
                    {contactPhone && (
                      <ClickToCallButton contactId={deal.contact_id} phoneNumber={contactPhone} dealId={deal.id} size="sm" variant="ghost" />
                    )}
                    <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => navigate(`/contacts?open=${deal.contact_id}`)}>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm font-medium">{getContactName()}</p>
                {deal.contact?.email && <p className="text-xs text-muted-foreground">{deal.contact.email}</p>}
                {contactPhone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {contactPhone}
                  </p>
                )}
              </div>

              {/* Salesperson */}
              <div className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                  <UserCheck className="h-3.5 w-3.5" /> Assegnato a
                </h4>
                <SalespersonAssignmentSelect
                  value={(deal as any).assigned_user_id || null}
                  onChange={handleAssignmentChange}
                  disabled={assignDeal.isPending || !canEdit}
                />
              </div>

              {/* Value */}
              {deal.value && (
                <div className="rounded-lg border p-3">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-green-600" />
                    <span className="text-xs font-semibold">Valore Deal</span>
                  </div>
                  <p className="text-xl font-bold text-green-700 mt-1">€{deal.value.toLocaleString("it-IT")}</p>
                </div>
              )}

              {/* Campaign */}
              {hasMarketingAccess && (
                <div className="rounded-lg border p-3">
                  <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                    <Megaphone className="h-3.5 w-3.5" /> Campagna
                  </h4>
                  <CampaignSelect
                    value={deal.marketing_campaign_id || null}
                    onChange={handleCampaignChange}
                    disabled={updateCampaign.isPending || !canEdit || !canEditCampaigns}
                  />
                </div>
              )}

              {/* Sales Order */}
              <div className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                  <ShoppingCart className="h-3.5 w-3.5" /> Vendita
                </h4>
                {existingSalesOrder ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{existingSalesOrder.order_number}</p>
                        <p className="text-xs text-muted-foreground">€{existingSalesOrder.total_amount.toLocaleString("it-IT")}</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => navigate("/sales")}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Apri
                      </Button>
                    </div>
                    {orderItems.length > 0 && (
                      <div className="border-t pt-2 mt-2">
                        <h5 className="text-[10px] font-medium flex items-center gap-1 mb-1.5 text-muted-foreground uppercase tracking-wide">
                          <Package className="h-3 w-3" /> Prodotti
                        </h5>
                        <div className="space-y-1">
                          {orderItems.map((item) => (
                            <div key={item.id} className="flex items-start justify-between text-xs bg-muted/50 rounded px-2 py-1.5">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{item.product?.name || item.name}</p>
                                <p className="text-[10px] text-muted-foreground">
                                  {item.quantity} × €{item.unit_price.toLocaleString("it-IT")}
                                  {item.discount_percent && item.discount_percent > 0 && (
                                    <span className="ml-1 text-primary">(-{item.discount_percent}%)</span>
                                  )}
                                </p>
                              </div>
                              <p className="font-medium text-right ml-2">€{item.line_total.toLocaleString("it-IT")}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : deal.status === "won" ? (
                  <Button onClick={handleCreateSalesOrder} disabled={createSalesOrder.isPending} size="sm" className="w-full h-8 text-xs">
                    <ShoppingCart className="h-3.5 w-3.5 mr-1.5" />
                    {createSalesOrder.isPending ? "Creazione..." : "Crea Vendita"}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">Segna il deal come "Vinto" per creare una vendita</p>
                )}
              </div>

              {/* Tags */}
              <div className="rounded-lg border p-3">
                <h4 className="text-xs font-semibold flex items-center gap-1.5 mb-2">
                  <Tag className="h-3.5 w-3.5" /> Tag
                </h4>
                <EntityTagList entityType="deal" entityId={deal.id} scope="deal" />
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <div>
                    <p className="text-muted-foreground">Creato</p>
                    <p className="font-medium">{format(new Date(deal.created_at), "dd MMM yyyy", { locale: it })}</p>
                  </div>
                </div>
                {deal.closed_at && (
                  <div className="flex items-center gap-1.5">
                    <Archive className="h-3.5 w-3.5 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground">Chiuso</p>
                      <p className="font-medium">{format(new Date(deal.closed_at), "dd MMM yyyy", { locale: it })}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Updated */}
              <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Aggiornato {formatDistanceToNow(new Date(deal.updated_at), { locale: it, addSuffix: true })}
              </div>

              {/* Notes */}
              {deal.notes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold mb-1">Note</h4>
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{deal.notes}</p>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="chat" className="flex-1 overflow-hidden mt-2 px-2 pb-2">
          <EntityChatBox entityType="deal" entityId={deal.id} className="h-full" />
        </TabsContent>

        <TabsContent value="audit" className="flex-1 overflow-hidden mt-2 px-2 pb-2">
          <ScrollArea className="h-full">
            <AuditTimeline entityType="deal" entityId={deal.id} />
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* Ticket Dialog */}
      <CreateTicketDialog
        open={ticketDialogOpen}
        onOpenChange={setTicketDialogOpen}
        contactId={deal.contact_id}
        contactName={getContactName()}
        dealId={deal.id}
        dealTitle={getContactName()}
        sourceContext="deal_sheet"
      />
    </div>
  );
}
