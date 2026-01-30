import { useState } from "react";
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
import { useUpdateDealStatus } from "@/hooks/usePipeline";
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
  const updateStatus = useUpdateDealStatus();

  if (!deal) return null;

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
      { dealId: deal.id, status },
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
                {/* Quick Actions */}
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

                {/* Contact Info */}
                <div className="rounded-lg border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contatto
                    </h4>
                    <Button variant="ghost" size="sm">
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
