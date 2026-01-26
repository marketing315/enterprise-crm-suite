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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useWebhooks,
  useWebhookDeliveries,
  WEBHOOK_EVENT_TYPES,
} from "@/hooks/useWebhooks";
import { DeliveryDetailSheet } from "./DeliveryDetailSheet";

const STATUS_OPTIONS = [
  { value: "all", label: "Tutti gli stati" },
  { value: "pending", label: "In attesa" },
  { value: "sending", label: "In invio" },
  { value: "success", label: "Completato" },
  { value: "failed", label: "Fallito" },
] as const;

const PAGE_SIZE = 20;

export function DeliveriesMonitor() {
  const { data: webhooks } = useWebhooks();

  const [webhookId, setWebhookId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [eventType, setEventType] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useWebhookDeliveries({
    webhookId: webhookId === "all" ? undefined : webhookId,
    status: status === "all" ? undefined : status,
    eventType: eventType === "all" ? undefined : eventType,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = Math.ceil((data?.total_count || 0) / PAGE_SIZE);

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
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Monitor Deliveries
              </CardTitle>
              <CardDescription>
                Monitora lo stato delle consegne webhook in tempo reale
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <Select value={webhookId} onValueChange={(v) => { setWebhookId(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]" data-testid="filter-webhook">
                <SelectValue placeholder="Tutti i webhook" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">Tutti i webhook</SelectItem>
                {webhooks?.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
              <SelectTrigger className="w-[180px]" data-testid="filter-status">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={eventType} onValueChange={(v) => { setEventType(v); setPage(0); }}>
              <SelectTrigger className="w-[200px]" data-testid="filter-event-type">
                <SelectValue placeholder="Tipo evento" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">Tutti gli eventi</SelectItem>
                {WEBHOOK_EVENT_TYPES.map((e) => (
                  <SelectItem key={e.value} value={e.value}>
                    {e.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : data?.deliveries?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="mx-auto h-12 w-12 opacity-20 mb-4" />
              <p>Nessuna delivery trovata</p>
            </div>
          ) : (
            <Table data-testid="deliveries-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Webhook</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead>Tentativi</TableHead>
                  <TableHead>Risposta</TableHead>
                  <TableHead>Data</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.deliveries?.map((delivery) => (
                  <TableRow
                    key={delivery.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedDeliveryId(delivery.id)}
                    data-testid="delivery-row"
                  >
                    <TableCell className="font-medium">
                      {delivery.webhook_name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{getEventLabel(delivery.event_type)}</Badge>
                    </TableCell>
                    <TableCell>{getStatusBadge(delivery.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {delivery.attempt_count}/{delivery.max_attempts}
                    </TableCell>
                    <TableCell>
                      {delivery.response_status ? (
                        <Badge
                          variant={
                            delivery.response_status >= 200 && delivery.response_status < 300
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {delivery.response_status}
                        </Badge>
                      ) : delivery.last_error ? (
                        <span className="text-xs text-destructive truncate max-w-[150px] block">
                          {delivery.last_error}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(delivery.created_at), "dd MMM HH:mm:ss", {
                        locale: it,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <div className="text-sm text-muted-foreground">
                Pagina {page + 1} di {totalPages} ({data?.total_count} totali)
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Precedente
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Successiva
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <DeliveryDetailSheet
        deliveryId={selectedDeliveryId}
        onClose={() => setSelectedDeliveryId(null)}
      />
    </>
  );
}
