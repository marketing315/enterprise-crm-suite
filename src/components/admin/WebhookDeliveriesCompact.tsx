import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Activity, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useWebhookDeliveries, WEBHOOK_EVENT_TYPES } from "@/hooks/useWebhooks";
import { DeliveryDetailSheet } from "@/components/settings/webhooks/DeliveryDetailSheet";

const COMPACT_LIMIT = 50;

export function WebhookDeliveriesCompact() {
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useWebhookDeliveries({
    limit: COMPACT_LIMIT,
    offset: 0,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600">OK</Badge>;
      case "failed":
        return <Badge variant="destructive">Fail</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "sending":
        return <Badge className="bg-sky-600 hover:bg-sky-700 dark:bg-sky-500 dark:hover:bg-sky-600">Sending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getEventLabel = (eventType: string) => {
    const found = WEBHOOK_EVENT_TYPES.find((e) => e.value === eventType);
    return found?.label || eventType;
  };

  return (
    <>
      <Card data-testid="webhooks-dashboard-latest-deliveries">
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Ultime Deliveries
              </CardTitle>
              <CardDescription>
                Le ultime {COMPACT_LIMIT} consegne webhook
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="shrink-0"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Aggiorna</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : data?.deliveries?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Nessuna delivery trovata</p>
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden max-h-[400px] overflow-y-auto space-y-2 -mx-2 px-2">
                {data?.deliveries?.map((delivery) => (
                  <button
                    key={delivery.id}
                    type="button"
                    onClick={() => setSelectedDeliveryId(delivery.id)}
                    data-testid="compact-delivery-row"
                    className="w-full text-left rounded-xl border border-border/60 bg-card p-3 hover:bg-muted/40 active:scale-[0.99] transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {delivery.webhook_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {getEventLabel(delivery.event_type)}
                        </p>
                      </div>
                      <div className="shrink-0">{getStatusBadge(delivery.status)}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      {delivery.response_status ? (
                        <Badge
                          variant={
                            delivery.response_status >= 200 &&
                            delivery.response_status < 300
                              ? "secondary"
                              : "destructive"
                          }
                          className="text-xs"
                        >
                          {delivery.response_status}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                      <span className="text-muted-foreground tabular-nums">
                        {format(new Date(delivery.created_at), "dd/MM HH:mm:ss", {
                          locale: it,
                        })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Desktop: tabella tradizionale */}
              <div className="hidden md:block max-h-[400px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Webhook</TableHead>
                      <TableHead>Evento</TableHead>
                      <TableHead>Stato</TableHead>
                      <TableHead>Resp</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data?.deliveries?.map((delivery) => (
                      <TableRow
                        key={delivery.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedDeliveryId(delivery.id)}
                        data-testid="compact-delivery-row"
                      >
                        <TableCell className="font-medium text-sm">
                          {delivery.webhook_name}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {getEventLabel(delivery.event_type)}
                          </span>
                        </TableCell>
                        <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                        <TableCell>
                          {delivery.response_status ? (
                            <Badge
                              variant={
                                delivery.response_status >= 200 &&
                                delivery.response_status < 300
                                  ? "secondary"
                                  : "destructive"
                              }
                              className="text-xs"
                            >
                              {delivery.response_status}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(delivery.created_at), "HH:mm:ss", {
                            locale: it,
                          })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <DeliveryDetailSheet
        deliveryId={selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
      />
    </>
  );
}
