/**
 * F5.6 — Dialog di esportazione "Foglio venditori" verso Google Sheet.
 * Mostra la configurazione corrente, consente di crearla/aggiornarla
 * (solo admin del brand / admin di sistema), e di eseguire l'export on-demand.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import {
  useBrandPerfSheetConfig,
  useSavePerfSheetConfig,
  useRunPerfSheetExport,
  type PerfSheetPeriod,
} from "@/hooks/useBrandPerfSheetConfig";

interface Props {
  brandId: string;
  canEdit: boolean;
}

export function PerfSheetExportDialog({ brandId, canEdit }: Props) {
  const [open, setOpen] = useState(false);
  const { data: cfg, isLoading } = useBrandPerfSheetConfig(brandId);
  const save = useSavePerfSheetConfig();
  const run = useRunPerfSheetExport();

  const [url, setUrl] = useState("");
  const [tabName, setTabName] = useState("Performance");
  const [period, setPeriod] = useState<PerfSheetPeriod>("current_month");
  const [cronEnabled, setCronEnabled] = useState(true);

  useEffect(() => {
    if (cfg) {
      setUrl(cfg.spreadsheet_url);
      setTabName(cfg.tab_name);
      setPeriod(cfg.period_mode);
      setCronEnabled(cfg.cron_enabled);
    }
  }, [cfg]);

  async function handleSave() {
    try {
      await save.mutateAsync({
        brand_id: brandId,
        spreadsheet_url: url.trim(),
        tab_name: tabName.trim() || "Performance",
        period_mode: period,
        cron_enabled: cronEnabled,
      });
      toast.success("Configurazione salvata");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salvataggio fallito");
    }
  }

  async function handleRun() {
    try {
      const r = await run.mutateAsync({ brand_id: brandId, period_mode: period });
      toast.success(`Export completato: ${r.rows} righe scritte`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export fallito");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Sheet className="h-4 w-4" /> Google Sheet
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sheet className="h-5 w-5" /> Esporta su Google Sheet
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {cfg && (
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={cfg.last_status === "success" ? "default" : cfg.last_status === "failed" ? "destructive" : "secondary"}>
                  {cfg.last_status ?? "mai eseguito"}
                </Badge>
                {cfg.last_export_at && (
                  <span className="text-muted-foreground">
                    {formatDistanceToNow(new Date(cfg.last_export_at), { addSuffix: true, locale: it })}
                  </span>
                )}
                {cfg.last_rows_exported != null && (
                  <span className="text-muted-foreground">· {cfg.last_rows_exported} righe</span>
                )}
              </div>
              {cfg.last_error && (
                <div className="text-xs text-destructive break-all">{cfg.last_error}</div>
              )}
              <a href={cfg.spreadsheet_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                Apri Sheet <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sheet-url">URL Google Sheet</Label>
            <Input
              id="sheet-url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={!canEdit || isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Crea il Sheet manualmente e condividi <strong>in modifica</strong> con l'email del service-account del brand.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="sheet-tab">Tab</Label>
              <Input id="sheet-tab" value={tabName} onChange={(e) => setTabName(e.target.value)} disabled={!canEdit} />
            </div>
            <div className="space-y-2">
              <Label>Periodo</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as PerfSheetPeriod)} disabled={!canEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Mese corrente</SelectItem>
                  <SelectItem value="previous_month">Mese scorso</SelectItem>
                  <SelectItem value="last_30d">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="ytd">Year-to-date</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="cron-toggle" className="cursor-pointer">Aggiornamento automatico giornaliero</Label>
              <p className="text-xs text-muted-foreground">Esegue ogni giorno alle 06:00 (Europe/Rome)</p>
            </div>
            <Switch id="cron-toggle" checked={cronEnabled} onCheckedChange={setCronEnabled} disabled={!canEdit} />
          </div>

          {!canEdit && (
            <p className="text-xs text-muted-foreground">Solo gli admin del brand possono modificare la configurazione.</p>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canEdit && (
            <Button variant="outline" onClick={handleSave} disabled={save.isPending || !url.trim()}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salva
            </Button>
          )}
          <Button onClick={handleRun} disabled={run.isPending || !cfg}>
            {run.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Esporta ora
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
