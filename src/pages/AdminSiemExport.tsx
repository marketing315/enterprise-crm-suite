import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertCircle, CheckCircle2, PlayCircle, Plus, RefreshCw, Trash2, Shield, Clock } from "lucide-react";
import { useSiemDestinations, useSaveSiemDestination, useDeleteSiemDestination, useTriggerSiemExport, useSiemExportLog, type SiemDestination } from "@/hooks/useSiemDestinations";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

function generateSecret(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function DestinationForm({ initial, onClose }: { initial?: SiemDestination; onClose: () => void }) {
  const save = useSaveSiemDestination();
  const [name, setName] = useState(initial?.name ?? "");
  const [endpoint, setEndpoint] = useState(initial?.endpoint_url ?? "");
  const [secret, setSecret] = useState(initial?.hmac_secret ?? generateSecret());
  const [maskPii, setMaskPii] = useState(initial?.mask_pii ?? true);
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [batchSize, setBatchSize] = useState(initial?.batch_size ?? 100);

  const handleSave = async () => {
    if (!name.trim() || !endpoint.trim() || !secret.trim()) return;
    await save.mutateAsync({
      id: initial?.id,
      name: name.trim(),
      endpoint_url: endpoint.trim(),
      hmac_secret: secret.trim(),
      mask_pii: maskPii,
      is_active: isActive,
      batch_size: batchSize,
    });
    onClose();
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Nome destinazione</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="es. Splunk Production" />
      </div>
      <div className="space-y-2">
        <Label>URL endpoint HTTPS</Label>
        <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="https://siem.example.com/ingest" />
      </div>
      <div className="space-y-2">
        <Label>Secret HMAC-SHA256</Label>
        <div className="flex gap-2">
          <Input value={secret} onChange={(e) => setSecret(e.target.value)} className="font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => setSecret(generateSecret())}>
            Rigenera
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Verrà inviato in <code>X-Signature-SHA256</code> (formato: <code>HMAC(timestamp.body)</code>)
        </p>
      </div>
      <div className="space-y-2">
        <Label>Batch size (1-500)</Label>
        <Input type="number" min={1} max={500} value={batchSize} onChange={(e) => setBatchSize(Number(e.target.value))} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Mascheramento PII</Label>
          <p className="text-xs text-muted-foreground">Maschera email, telefoni, nomi prima dell'invio</p>
        </div>
        <Switch checked={maskPii} onCheckedChange={setMaskPii} />
      </div>
      <div className="flex items-center justify-between rounded-lg border p-3">
        <Label>Attiva</Label>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>Annulla</Button>
        <Button onClick={handleSave} disabled={save.isPending || !name || !endpoint || !secret}>
          {save.isPending ? "Salvataggio..." : "Salva"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function DestinationCard({ dest }: { dest: SiemDestination }) {
  const [editing, setEditing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const del = useDeleteSiemDestination();
  const { data: logs = [] } = useSiemExportLog(showLogs ? dest.id : null);
  const isHealthy = dest.consecutive_failures === 0 && !!dest.last_success_at;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-4 w-4" />
              {dest.name}
              {dest.is_active ? (
                <Badge variant="outline" className="text-xs">Attivo</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Disattivo</Badge>
              )}
              {isHealthy ? (
                <Badge variant="outline" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-600" /> OK
                </Badge>
              ) : dest.consecutive_failures > 0 ? (
                <Badge variant="destructive" className="text-xs gap-1">
                  <AlertCircle className="h-3 w-3" /> {dest.consecutive_failures} errori
                </Badge>
              ) : null}
            </CardTitle>
            <CardDescription className="mt-1 break-all font-mono text-xs">{dest.endpoint_url}</CardDescription>
          </div>
          <div className="flex shrink-0 gap-1">
            <Dialog open={editing} onOpenChange={setEditing}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">Modifica</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Modifica destinazione</DialogTitle>
                </DialogHeader>
                <DestinationForm initial={dest} onClose={() => setEditing(false)} />
              </DialogContent>
            </Dialog>
            <Button variant="ghost" size="sm" onClick={() => setShowLogs((s) => !s)}>
              <Clock className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (confirm(`Eliminare "${dest.name}"?`)) del.mutate(dest.id);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span>PII masked: <strong className="text-foreground">{dest.mask_pii ? "Sì" : "No"}</strong></span>
          <span>Batch: <strong className="text-foreground">{dest.batch_size}</strong></span>
          <span>
            Ultimo export:{" "}
            <strong className="text-foreground">
              {dest.last_success_at
                ? formatDistanceToNow(new Date(dest.last_success_at), { addSuffix: true, locale: it })
                : "mai"}
            </strong>
          </span>
        </div>
        {dest.last_error && (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            <strong>Ultimo errore:</strong> {dest.last_error}
          </div>
        )}
        {showLogs && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-md border">
            {logs.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">Nessun log</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-left">Quando</th>
                    <th className="p-2 text-left">Stato</th>
                    <th className="p-2 text-right">Eventi</th>
                    <th className="p-2 text-right">HTTP</th>
                    <th className="p-2 text-right">Latenza</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="p-2">{new Date(l.created_at).toLocaleString("it-IT")}</td>
                      <td className="p-2">
                        {l.status === "success" ? (
                          <Badge variant="outline" className="text-xs">OK</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-xs">{l.status}</Badge>
                        )}
                      </td>
                      <td className="p-2 text-right">{l.events_count}</td>
                      <td className="p-2 text-right">{l.http_status ?? "—"}</td>
                      <td className="p-2 text-right">{l.latency_ms ?? "—"} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSiemExport() {
  const { data: destinations = [], isLoading } = useSiemDestinations();
  const trigger = useTriggerSiemExport();
  const [creating, setCreating] = useState(false);

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">SIEM Export</h1>
          <p className="text-sm text-muted-foreground">
            Esporta gli audit events verso sistemi SIEM esterni (Splunk, Datadog, Elastic) tramite webhook firmati HMAC-SHA256.
            L'export gira automaticamente ogni 5 minuti.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => trigger.mutate()} disabled={trigger.isPending}>
            <RefreshCw className={`mr-2 h-4 w-4 ${trigger.isPending ? "animate-spin" : ""}`} />
            Esegui adesso
          </Button>
          <Dialog open={creating} onOpenChange={setCreating}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" /> Nuova destinazione
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Nuova destinazione SIEM</DialogTitle>
                <DialogDescription>
                  Configura un endpoint HTTPS che riceverà gli audit events firmati con HMAC.
                </DialogDescription>
              </DialogHeader>
              <DestinationForm onClose={() => setCreating(false)} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground">Caricamento...</p>
      ) : destinations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <PlayCircle className="h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nessuna destinazione SIEM configurata.
            </p>
            <Button onClick={() => setCreating(true)}>
              <Plus className="mr-2 h-4 w-4" /> Aggiungi la prima
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {destinations.map((d) => (
            <DestinationCard key={d.id} dest={d} />
          ))}
        </div>
      )}
    </div>
  );
}
