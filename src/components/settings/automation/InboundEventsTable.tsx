import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Inbox, Eye, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import type { WebhookInboundEvent } from "@/hooks/useAutomationRules";
import { useState } from "react";

interface Props {
  events: WebhookInboundEvent[];
}

export function InboundEventsTable({ events }: Props) {
  const [selectedEvent, setSelectedEvent] = useState<WebhookInboundEvent | null>(null);

  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Inbox className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-muted-foreground text-center">
            Nessun evento inbound ricevuto.
            <br />
            Gli eventi appariranno qui quando arrivano i webhook.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "processed":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Processato
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Fallito
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            In coda
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            In elaborazione
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <>
      <ScrollArea className="h-[500px]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ricevuto</TableHead>
              <TableHead>Sorgente</TableHead>
              <TableHead>Tipo Evento</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Tentativi</TableHead>
              <TableHead>Errore</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow key={event.id}>
                <TableCell className="text-sm">
                  {new Date(event.received_at).toLocaleString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{event.source}</Badge>
                </TableCell>
                <TableCell className="text-sm font-mono">{event.event_type}</TableCell>
                <TableCell>{getStatusBadge(event.status)}</TableCell>
                <TableCell className="text-sm">{event.attempts}</TableCell>
                <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                  {event.last_error || "-"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedEvent(event)}
                   aria-label="Visualizza">
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dettaglio Evento</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">ID:</span>
                  <span className="ml-2 font-mono">{selectedEvent.id}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sorgente:</span>
                  <span className="ml-2">{selectedEvent.source}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Tipo:</span>
                  <span className="ml-2 font-mono">{selectedEvent.event_type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stato:</span>
                  <span className="ml-2">{getStatusBadge(selectedEvent.status)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Ricevuto:</span>
                  <span className="ml-2">
                    {new Date(selectedEvent.received_at).toLocaleString("it-IT")}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Processato:</span>
                  <span className="ml-2">
                    {selectedEvent.processed_at
                      ? new Date(selectedEvent.processed_at).toLocaleString("it-IT")
                      : "-"}
                  </span>
                </div>
              </div>

              {selectedEvent.last_error && (
                <div className="p-3 bg-destructive/10 rounded-md">
                  <span className="text-sm font-medium text-destructive">Errore:</span>
                  <p className="text-sm mt-1">{selectedEvent.last_error}</p>
                </div>
              )}

              <div>
                <span className="text-sm font-medium">Payload:</span>
                <pre className="mt-2 p-3 bg-muted rounded-md text-xs overflow-x-auto">
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
