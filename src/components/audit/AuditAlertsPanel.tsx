import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, Plus, Send, Trash2, Webhook, Mail } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  useAlertChannels,
  useAlertDeliveries,
  useUpsertAlertChannel,
  useDeleteAlertChannel,
  useDispatchAlerts,
  type AlertChannel,
  type AlertSeverity,
  type AlertChannelType,
} from "@/hooks/useAuditAlerts";

const SEVERITIES: AlertSeverity[] = ["low", "medium", "high", "critical"];

function severityBadge(s: string) {
  const variant =
    s === "critical" ? "destructive" :
    s === "high" ? "destructive" :
    s === "medium" ? "default" : "secondary";
  return <Badge variant={variant as never}>{s}</Badge>;
}

function statusBadge(s: string) {
  if (s === "sent") return <Badge className="bg-emerald-600 hover:bg-emerald-700">Inviato</Badge>;
  if (s === "failed") return <Badge variant="destructive">Fallito</Badge>;
  if (s === "retrying") return <Badge className="bg-amber-600 hover:bg-amber-700">Retry</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

function ChannelDialog({
  channel,
  trigger,
}: {
  channel?: AlertChannel;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const upsert = useUpsertAlertChannel();
  const [form, setForm] = useState({
    name: channel?.name ?? "",
    channel_type: (channel?.channel_type ?? "webhook") as AlertChannelType,
    destination: channel?.destination ?? "",
    webhook_secret: channel?.webhook_secret ?? "",
    min_severity: (channel?.min_severity ?? "high") as AlertSeverity,
    is_active: channel?.is_active ?? true,
    mask_pii: channel?.mask_pii ?? true,
    anomaly_types: (channel?.anomaly_types ?? []).join(", "),
  });

  const submit = async () => {
    await upsert.mutateAsync({
      id: channel?.id,
      name: form.name,
      channel_type: form.channel_type,
      destination: form.destination,
      webhook_secret: form.channel_type === "webhook" ? form.webhook_secret || null : null,
      min_severity: form.min_severity,
      is_active: form.is_active,
      mask_pii: form.mask_pii,
      anomaly_types: form.anomaly_types
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{channel ? "Modifica canale" : "Nuovo canale alert"}</DialogTitle>
          <DialogDescription className="sr-only">Finestra di dialogo</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Slack #security" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={form.channel_type} onValueChange={(v) => setForm({ ...form, channel_type: v as AlertChannelType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severità minima</Label>
              <Select value={form.min_severity} onValueChange={(v) => setForm({ ...form, min_severity: v as AlertSeverity })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{form.channel_type === "webhook" ? "URL webhook" : "Email destinatario"}</Label>
            <Input
              value={form.destination}
              onChange={(e) => setForm({ ...form, destination: e.target.value })}
              placeholder={form.channel_type === "webhook" ? "https://hooks.example.com/..." : "ops@example.com"}
            />
          </div>
          {form.channel_type === "webhook" && (
            <div>
              <Label>Secret HMAC (opzionale)</Label>
              <Input
                type="password"
                value={form.webhook_secret}
                onChange={(e) => setForm({ ...form, webhook_secret: e.target.value })}
                placeholder="Usato per firmare X-Signature-SHA256"
              />
            </div>
          )}
          <div>
            <Label>Filtra per tipi anomalia (opzionale, separati da virgola)</Label>
            <Input
              value={form.anomaly_types}
              onChange={(e) => setForm({ ...form, anomaly_types: e.target.value })}
              placeholder="mass_export, off_hours"
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Attivo</Label>
            <Switch id="active" checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="mask">Maschera PII nel payload</Label>
            <Switch id="mask" checked={form.mask_pii} onCheckedChange={(v) => setForm({ ...form, mask_pii: v })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button>
          <Button onClick={submit} disabled={upsert.isPending || !form.name || !form.destination}>
            Salva
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AuditAlertsPanel() {
  const channels = useAlertChannels();
  const deliveries = useAlertDeliveries(50);
  const remove = useDeleteAlertChannel();
  const dispatch = useDispatchAlerts();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" /> Canali alert
              </CardTitle>
              <CardDescription>
                Webhook ed email che ricevono notifiche sulle anomalie audit
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => dispatch.mutate()} disabled={dispatch.isPending}>
                <Send className="mr-2 h-4 w-4" />
                Esegui dispatcher
              </Button>
              <ChannelDialog
                trigger={
                  <Button size="sm"><Plus className="mr-2 h-4 w-4" />Nuovo canale</Button>
                }
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {channels.isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : channels.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="mx-auto h-10 w-10 opacity-20 mb-2" />
              <p className="text-sm">Nessun canale configurato</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Destinazione</TableHead>
                  <TableHead>Soglia</TableHead>
                  <TableHead>Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels.data?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {c.channel_type === "webhook" ? <Webhook className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                        {c.channel_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-xs truncate">{c.destination}</TableCell>
                    <TableCell>{severityBadge(c.min_severity)}</TableCell>
                    <TableCell>
                      {c.is_active ? <Badge className="bg-emerald-600">Attivo</Badge> : <Badge variant="secondary">Disattivo</Badge>}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <ChannelDialog channel={c} trigger={<Button variant="ghost" size="sm">Modifica</Button>} />
                      <Button variant="ghost" size="sm" onClick={() => remove.mutate(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ultime consegne</CardTitle>
          <CardDescription>Storico degli invii (max 50)</CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : deliveries.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nessuna consegna registrata</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stato</TableHead>
                  <TableHead>Tentativi</TableHead>
                  <TableHead>Resp</TableHead>
                  <TableHead>Errore</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deliveries.data?.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>{statusBadge(d.status)}</TableCell>
                    <TableCell>{d.attempt_count}</TableCell>
                    <TableCell className="text-xs">{d.response_status ?? "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                      {d.error_message ?? "-"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(d.created_at), "dd MMM HH:mm:ss", { locale: it })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
