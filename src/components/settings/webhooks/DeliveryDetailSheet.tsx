import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useWebhookDeliveryDetail, WEBHOOK_EVENT_TYPES } from "@/hooks/useWebhooks";

interface Props {
  deliveryId: string | null;
  onClose: () => void;
}

export function DeliveryDetailSheet({ deliveryId, onClose }: Props) {
  const { data: delivery, isLoading } = useWebhookDeliveryDetail(deliveryId);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500 hover:bg-green-600">Completato</Badge>;
      case "failed":
        return <Badge variant="destructive">Fallito</Badge>;
      case "pending":
        return <Badge variant="secondary">In attesa</Badge>;
      case "sending":
        return <Badge className="bg-blue-500 hover:bg-blue-600">In invio</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEventLabel = (eventType: string) => {
    const found = WEBHOOK_EVENT_TYPES.find((e) => e.value === eventType);
    return found?.label || eventType;
  };

  return (
    <Sheet open={!!deliveryId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-[500px] sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>Dettaglio Delivery</SheetTitle>
          <SheetDescription>
            Informazioni complete sulla consegna webhook
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <div className="space-y-4 py-6">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : delivery ? (
          <ScrollArea className="h-[calc(100vh-120px)] py-6">
            <div className="space-y-6">
              {/* Status & Meta */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Stato</p>
                  <div className="mt-1">{getStatusBadge(delivery.status)}</div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Evento</p>
                  <Badge variant="outline" className="mt-1">
                    {getEventLabel(delivery.event_type)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Tentativi</p>
                  <p className="font-medium">
                    {delivery.attempt_count} / {delivery.max_attempts}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">HTTP Status</p>
                  <p className="font-medium">
                    {delivery.response_status ?? "N/A"}
                  </p>
                </div>
              </div>

              <Separator />

              {/* Webhook Info */}
              <div>
                <p className="text-sm text-muted-foreground mb-1">Webhook</p>
                <p className="font-medium">{delivery.webhook_name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {delivery.webhook_url}
                </p>
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Creato</p>
                  <p className="text-sm">
                    {format(new Date(delivery.created_at), "dd MMM yyyy HH:mm:ss", {
                      locale: it,
                    })}
                  </p>
                </div>
                {delivery.next_attempt_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Prossimo tentativo</p>
                    <p className="text-sm">
                      {format(new Date(delivery.next_attempt_at), "dd MMM yyyy HH:mm:ss", {
                        locale: it,
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Error */}
              {delivery.last_error && (
                <>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Ultimo errore</p>
                    <div className="bg-destructive/10 rounded-md p-3 text-sm text-destructive">
                      {delivery.last_error}
                    </div>
                  </div>
                </>
              )}

              <Separator />

              {/* Payload */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Payload</p>
                <div className="bg-muted rounded-md p-3 overflow-x-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {JSON.stringify(delivery.payload, null, 2)}
                  </pre>
                </div>
              </div>

              {/* Response Body */}
              {delivery.response_body && (
                <div>
                  <p className="text-sm text-muted-foreground mb-2">Response Body</p>
                  <div className="bg-muted rounded-md p-3 overflow-x-auto">
                    <pre className="text-xs font-mono whitespace-pre-wrap">
                      {delivery.response_body}
                    </pre>
                  </div>
                </div>
              )}

              {/* IDs */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Delivery ID: {delivery.id}</p>
                <p>Event ID: {delivery.event_id}</p>
                <p>Webhook ID: {delivery.webhook_id}</p>
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="py-6 text-center text-muted-foreground">
            Delivery non trovata
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
