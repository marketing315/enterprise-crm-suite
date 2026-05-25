/**
 * F5.7 — Admin: DPIA & Data Retention
 * Configurazione per-brand della retention + esecuzione manuale (dry-run / reale).
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Shield, ShieldCheck, Trash2, PlayCircle, Eye, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BrandRetentionConfig,
  useBrandsForRetention,
  useRetentionConfigs,
  useRetentionRuns,
  useRunRetentionCleanup,
  useUpsertRetentionConfig,
} from "@/hooks/useDataRetention";

const DPIA_VERSION = "1.0";

type EditorState = {
  brand_id: string;
  call_audio_retention_days: string;
  call_transcript_retention_days: string;
  alert_events_retention_days: string;
  sheets_export_logs_retention_days: string;
  dpia_acknowledge: boolean;
  notes: string;
};

function toInputValue(n: number | null | undefined): string {
  return n == null ? "" : String(n);
}
function parseDays(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

function ConfigEditor({
  open,
  onOpenChange,
  brand,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  brand: { id: string; name: string } | null;
  initial: BrandRetentionConfig | undefined;
}) {
  const upsert = useUpsertRetentionConfig();
  const [state, setState] = useState<EditorState>(() => ({
    brand_id: brand?.id ?? "",
    call_audio_retention_days: toInputValue(initial?.call_audio_retention_days),
    call_transcript_retention_days: toInputValue(initial?.call_transcript_retention_days),
    alert_events_retention_days: toInputValue(initial?.alert_events_retention_days ?? 180),
    sheets_export_logs_retention_days: toInputValue(initial?.sheets_export_logs_retention_days ?? 30),
    dpia_acknowledge: false,
    notes: initial?.notes ?? "",
  }));

  if (!brand) return null;

  const submit = async () => {
    try {
      await upsert.mutateAsync({
        brand_id: brand.id,
        call_audio_retention_days: parseDays(state.call_audio_retention_days),
        call_transcript_retention_days: parseDays(state.call_transcript_retention_days),
        alert_events_retention_days: parseDays(state.alert_events_retention_days),
        sheets_export_logs_retention_days: parseDays(state.sheets_export_logs_retention_days),
        dpia_acknowledge: state.dpia_acknowledge,
        dpia_version: state.dpia_acknowledge ? DPIA_VERSION : null,
        notes: state.notes || null,
      });
      toast.success("Configurazione retention salvata");
      onOpenChange(false);
    } catch (e) {
      toast.error("Errore", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Retention · {brand.name}</DialogTitle>
          <DialogDescription>
            Valori in giorni. Lascia vuoto per "nessun limite" (richiede motivazione nelle note).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Audio chiamate (gg)</Label>
            <Input
              type="number" min={1} placeholder="es. 90"
              value={state.call_audio_retention_days}
              onChange={(e) => setState({ ...state, call_audio_retention_days: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Trascrizioni (gg)</Label>
            <Input
              type="number" min={1} placeholder="es. 365"
              value={state.call_transcript_retention_days}
              onChange={(e) => setState({ ...state, call_transcript_retention_days: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Eventi alert (gg)</Label>
            <Input
              type="number" min={1}
              value={state.alert_events_retention_days}
              onChange={(e) => setState({ ...state, alert_events_retention_days: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Log export Sheets (gg)</Label>
            <Input
              type="number" min={1}
              value={state.sheets_export_logs_retention_days}
              onChange={(e) => setState({ ...state, sheets_export_logs_retention_days: e.target.value })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Note / motivazione</Label>
          <Textarea
            rows={3}
            value={state.notes}
            onChange={(e) => setState({ ...state, notes: e.target.value })}
            placeholder="Obbligatorio se uno dei campi è vuoto (nessun limite)."
          />
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Accetto la DPIA v{DPIA_VERSION}</div>
            <div className="text-xs text-muted-foreground">
              Confermo di aver letto <code>docs/dpia-call-recordings.md</code>.
            </div>
          </div>
          <Switch
            checked={state.dpia_acknowledge}
            onCheckedChange={(v) => setState({ ...state, dpia_acknowledge: v })}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annulla</Button>
          <Button onClick={submit} disabled={upsert.isPending}>
            {upsert.isPending ? "Salvataggio..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminDataRetention() {
  const { data: brands = [] } = useBrandsForRetention();
  const { data: configs = [] } = useRetentionConfigs();
  const { data: runs = [] } = useRetentionRuns();
  const cleanup = useRunRetentionCleanup();
  const [editor, setEditor] = useState<{ open: boolean; brand: { id: string; name: string } | null }>({
    open: false, brand: null,
  });

  const configByBrand = useMemo(() => {
    const m = new Map<string, BrandRetentionConfig>();
    configs.forEach((c) => m.set(c.brand_id, c));
    return m;
  }, [configs]);

  const runCleanup = async (brand_id: string | null, dry_run: boolean) => {
    try {
      const res = await cleanup.mutateAsync({ brand_id, dry_run });
      toast.success(
        `${dry_run ? "Dry-run" : "Esecuzione"} completata`,
        { description: `Righe interessate: ${res.total_affected}` }
      );
    } catch (e) {
      toast.error("Errore", { description: (e as Error).message });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" /> DPIA & Data Retention
          </h1>
          <p className="text-muted-foreground">
            Conservazione configurabile per audio, trascrizioni, eventi alert e log Sheets.
            Cleanup automatico ogni notte alle 03:30 IT.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runCleanup(null, true)} disabled={cleanup.isPending}>
            <Eye className="h-4 w-4 mr-2" /> Dry-run globale
          </Button>
          <Button variant="destructive" onClick={() => runCleanup(null, false)} disabled={cleanup.isPending}>
            <PlayCircle className="h-4 w-4 mr-2" /> Esegui ora
          </Button>
        </div>
      </div>

      <Card className="border-warning/40">
        <CardHeader className="flex flex-row items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          <CardTitle className="text-sm">Promemoria DPIA</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          La rimozione dell'audio nel CRM consiste nell'azzeramento del riferimento URL
          (<code>recording_url = NULL</code>); l'eliminazione fisica del file presso VoiSpeed
          è governata dalle policy del provider. Vedi <code>docs/dpia-call-recordings.md</code>.
        </CardContent>
      </Card>

      <Tabs defaultValue="brands">
        <TabsList>
          <TabsTrigger value="brands">Brand</TabsTrigger>
          <TabsTrigger value="runs">Esecuzioni recenti</TabsTrigger>
        </TabsList>

        <TabsContent value="brands" className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle>Configurazioni per brand</CardTitle>
              <CardDescription>
                Valori NULL → nessun limite. Acknowledgement DPIA richiesto per salvare.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Audio</TableHead>
                    <TableHead>Trascrizioni</TableHead>
                    <TableHead>Alert</TableHead>
                    <TableHead>Sheets</TableHead>
                    <TableHead>DPIA</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((b) => {
                    const cfg = configByBrand.get(b.id);
                    const fmt = (n: number | null | undefined) =>
                      n == null ? <span className="text-muted-foreground">∞</span> : `${n} gg`;
                    return (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium">{b.name}</TableCell>
                        <TableCell>{fmt(cfg?.call_audio_retention_days)}</TableCell>
                        <TableCell>{fmt(cfg?.call_transcript_retention_days)}</TableCell>
                        <TableCell>{fmt(cfg?.alert_events_retention_days)}</TableCell>
                        <TableCell>{fmt(cfg?.sheets_export_logs_retention_days)}</TableCell>
                        <TableCell>
                          {cfg?.dpia_acknowledged_at ? (
                            <Badge variant="default" className="gap-1">
                              <ShieldCheck className="h-3 w-3" />
                              v{cfg.dpia_version ?? "?"}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">non firmata</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right space-x-2">
                          <Button
                            size="sm" variant="outline"
                            onClick={() => runCleanup(b.id, true)}
                            disabled={cleanup.isPending || !cfg}
                          >
                            <Eye className="h-3 w-3 mr-1" /> Dry
                          </Button>
                          <Button
                            size="sm" variant="destructive"
                            onClick={() => runCleanup(b.id, false)}
                            disabled={cleanup.isPending || !cfg}
                          >
                            <Trash2 className="h-3 w-3 mr-1" /> Pulisci
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => setEditor({ open: true, brand: b })}
                          >
                            Configura
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <CardHeader>
              <CardTitle>Ultime 50 esecuzioni</CardTitle>
              <CardDescription>Cron + manuali, log conservato 90 giorni.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Modalità</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead className="text-right">Righe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(r.created_at), "dd/MM HH:mm:ss", { locale: it })}
                      </TableCell>
                      <TableCell>
                        {r.brand_id ?? <span className="text-muted-foreground">tutti</span>}
                      </TableCell>
                      <TableCell>
                        {r.dry_run
                          ? <Badge variant="secondary">dry-run</Badge>
                          : <Badge variant="destructive">apply</Badge>}
                      </TableCell>
                      <TableCell>{r.triggered_via}</TableCell>
                      <TableCell className="text-right">{r.total_affected}</TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                        Nessuna esecuzione registrata
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <ConfigEditor
        key={editor.brand?.id ?? "none"}
        open={editor.open}
        onOpenChange={(v) => setEditor({ ...editor, open: v })}
        brand={editor.brand}
        initial={editor.brand ? configByBrand.get(editor.brand.id) : undefined}
      />
    </div>
  );
}
