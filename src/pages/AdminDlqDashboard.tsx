import { useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  AlertTriangle,
  RefreshCw,
  Inbox,
  Send,
  ChevronDown,
  ChevronRight,
  Play,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useIngestDlq,
  useOutboundDlq,
  useReplayIngestDlq,
  useReplayOutboundDlq,
  useDlqStats,
  IngestDlqEntry,
  OutboundDlqEntry,
} from "@/hooks/useDlqData";

// ========================================
// DLQ Reason Badge
// ========================================

function DlqReasonBadge({ reason }: { reason: string | null }) {
  if (!reason) return <span className="text-muted-foreground">—</span>;

  const variants: Record<string, "destructive" | "secondary" | "outline"> = {
    invalid_json: "destructive",
    signature_failed: "destructive",
    missing_required: "secondary",
    mapping_error: "secondary",
    rate_limited: "outline",
    ai_extraction_failed: "secondary",
    contact_creation_failed: "destructive",
    unknown_error: "destructive",
  };

  const labels: Record<string, string> = {
    invalid_json: "JSON Invalido",
    signature_failed: "Firma HMAC",
    missing_required: "Dati Mancanti",
    mapping_error: "Mapping",
    rate_limited: "Rate Limit",
    ai_extraction_failed: "AI Extraction",
    contact_creation_failed: "Creazione Contatto",
    unknown_error: "Errore",
  };

  return (
    <Badge variant={variants[reason] || "secondary"}>
      {labels[reason] || reason}
    </Badge>
  );
}

// ========================================
// Ingest DLQ Table
// ========================================

function IngestDlqTable() {
  const { data: entries = [], isLoading, refetch } = useIngestDlq();
  const replayMutation = useReplayIngestDlq();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleReplay = async (entry: IngestDlqEntry) => {
    try {
      await replayMutation.mutateAsync(entry.id);
      toast.success("Richiesta rimessa in coda per rielaborazione");
    } catch (error) {
      toast.error(`Errore: ${error instanceof Error ? error.message : "Replay fallito"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Nessun errore in DLQ</p>
        <p className="text-sm">Le richieste fallite appariranno qui</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="w-[150px]">Data</TableHead>
              <TableHead>Sorgente</TableHead>
              <TableHead className="w-[150px]">Motivo</TableHead>
              <TableHead className="w-[200px]">Errore</TableHead>
              <TableHead className="w-[100px]">Azione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <Collapsible key={entry.id} asChild>
                <>
                  <TableRow>
                    <TableCell>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        >
                          {expandedId === entry.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="text-sm">
                      {format(new Date(entry.created_at), "dd/MM HH:mm:ss", { locale: it })}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.webhook_sources?.name || entry.source_id?.slice(0, 8) || "—"}
                    </TableCell>
                    <TableCell>
                      <DlqReasonBadge reason={entry.dlq_reason} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.error_message || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReplay(entry)}
                        disabled={replayMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Replay
                      </Button>
                    </TableCell>
                  </TableRow>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={6} className="p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="font-medium mb-2">Payload</h4>
                            <ScrollArea className="h-[200px] rounded-md border bg-background p-3">
                              <pre className="text-xs whitespace-pre-wrap">
                                {entry.raw_body_text ||
                                  (entry.raw_body ? JSON.stringify(entry.raw_body, null, 2) : "Nessun payload")}
                              </pre>
                            </ScrollArea>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Dettagli</h4>
                            <dl className="space-y-1 text-sm">
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">ID:</dt>
                                <dd className="font-mono text-xs">{entry.id}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">IP:</dt>
                                <dd>{entry.ip_address || "—"}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">User Agent:</dt>
                                <dd className="truncate max-w-[250px]">{entry.user_agent || "—"}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">Status:</dt>
                                <dd>
                                  <Badge variant="outline">{entry.status}</Badge>
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ========================================
// Outbound DLQ Table
// ========================================

function OutboundDlqTable() {
  const { data: entries = [], isLoading, refetch } = useOutboundDlq();
  const replayMutation = useReplayOutboundDlq();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replayDialogOpen, setReplayDialogOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<OutboundDlqEntry | null>(null);
  const [overrideUrl, setOverrideUrl] = useState("");

  const handleReplayClick = (entry: OutboundDlqEntry) => {
    setSelectedEntry(entry);
    setOverrideUrl("");
    setReplayDialogOpen(true);
  };

  const handleReplayConfirm = async () => {
    if (!selectedEntry) return;

    try {
      await replayMutation.mutateAsync({
        deliveryId: selectedEntry.id,
        overrideUrl: overrideUrl.trim() || undefined,
      });
      toast.success("Delivery rimesso in coda");
      setReplayDialogOpen(false);
    } catch (error) {
      toast.error(`Errore: ${error instanceof Error ? error.message : "Replay fallito"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Send className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg font-medium">Nessun delivery in DLQ</p>
        <p className="text-sm">I webhook falliti definitivamente appariranno qui</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Aggiorna
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="w-[150px]">Dead At</TableHead>
              <TableHead>Webhook</TableHead>
              <TableHead className="w-[120px]">Evento</TableHead>
              <TableHead className="w-[80px]">Tentativi</TableHead>
              <TableHead className="w-[200px]">Ultimo Errore</TableHead>
              <TableHead className="w-[100px]">Azione</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <Collapsible key={entry.id} asChild>
                <>
                  <TableRow>
                    <TableCell>
                      <CollapsibleTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        >
                          {expandedId === entry.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.dead_at
                        ? format(new Date(entry.dead_at), "dd/MM HH:mm:ss", { locale: it })
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium">
                      {entry.outbound_webhooks_safe?.name || entry.webhook_id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{entry.event_type}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="destructive">
                        {entry.attempt_count}/{entry.max_attempts}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.last_error || "—"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReplayClick(entry)}
                        disabled={replayMutation.isPending}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Replay
                      </Button>
                    </TableCell>
                  </TableRow>
                  <CollapsibleContent asChild>
                    <TableRow className="bg-muted/30">
                      <TableCell colSpan={7} className="p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <h4 className="font-medium mb-2">Payload</h4>
                            <ScrollArea className="h-[200px] rounded-md border bg-background p-3">
                              <pre className="text-xs whitespace-pre-wrap">
                                {JSON.stringify(entry.payload, null, 2)}
                              </pre>
                            </ScrollArea>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Dettagli</h4>
                            <dl className="space-y-1 text-sm">
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">ID:</dt>
                                <dd className="font-mono text-xs">{entry.id}</dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">URL:</dt>
                                <dd className="font-mono text-xs truncate max-w-[250px]">
                                  {entry.outbound_webhooks_safe?.url || "—"}
                                </dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground">HTTP Status:</dt>
                                <dd>
                                  <Badge variant={entry.response_status && entry.response_status < 400 ? "secondary" : "destructive"}>
                                    {entry.response_status || "N/A"}
                                  </Badge>
                                </dd>
                              </div>
                              {entry.response_body && (
                                <div>
                                  <dt className="text-muted-foreground mb-1">Response:</dt>
                                  <dd className="text-xs font-mono bg-background p-2 rounded border max-h-[100px] overflow-auto">
                                    {entry.response_body.slice(0, 500)}
                                  </dd>
                                </div>
                              )}
                            </dl>
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  </CollapsibleContent>
                </>
              </Collapsible>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Replay Dialog with Override URL */}
      <Dialog open={replayDialogOpen} onOpenChange={setReplayDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replay Delivery</DialogTitle>
            <DialogDescription>
              Rimetti questo delivery in coda per un nuovo tentativo. Puoi opzionalmente
              specificare un URL diverso.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>URL Originale</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono bg-muted p-2 rounded">
                {selectedEntry?.outbound_webhooks_safe?.url || "—"}
                <ExternalLink className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="override-url">URL Override (opzionale)</Label>
              <Input
                id="override-url"
                placeholder="https://nuovo-endpoint.example.com/webhook"
                value={overrideUrl}
                onChange={(e) => setOverrideUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Se specificato, il delivery verrà inviato a questo URL invece dell'originale
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplayDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleReplayConfirm} disabled={replayMutation.isPending}>
              {replayMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Replay
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ========================================
// Main Dashboard
// ========================================

export default function AdminDlqDashboard() {
  const { data: stats, isLoading: statsLoading } = useDlqStats();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10">
          <AlertTriangle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Dead Letter Queue</h1>
          <p className="text-sm text-muted-foreground">
            Gestione errori webhook ingest e outbound
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingest DLQ</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.ingest || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Richieste in ingresso fallite
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outbound DLQ</CardTitle>
            <Send className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {statsLoading ? <Skeleton className="h-8 w-12" /> : stats?.outbound || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              Delivery definitivamente falliti
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Gestione Errori</CardTitle>
          <CardDescription>
            Visualizza e gestisci le richieste fallite con possibilità di replay
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="ingest">
            <TabsList>
              <TabsTrigger value="ingest" className="gap-2">
                <Inbox className="h-4 w-4" />
                Ingest
                {stats && stats.ingest > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                    {stats.ingest}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="outbound" className="gap-2">
                <Send className="h-4 w-4" />
                Outbound
                {stats && stats.outbound > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 px-1.5">
                    {stats.outbound}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="ingest" className="mt-4">
              <IngestDlqTable />
            </TabsContent>
            <TabsContent value="outbound" className="mt-4">
              <OutboundDlqTable />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
