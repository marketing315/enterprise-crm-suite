import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MetaApp } from "@/hooks/useMetaApps";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metaApp: MetaApp | null;
}

interface BackfillResult {
  run_id?: string | null;
  forms_scanned: number;
  pages_fetched: number;
  leads_seen: number;
  leads_inserted: number;
  leads_duplicate: number;
  leads_recovered: number;
  leads_failed: number;
  aborted_max_leads?: boolean;
}

export function MetaBackfillDialog({ open, onOpenChange, metaApp }: Props) {
  const [days, setDays] = useState(30);
  const [formIds, setFormIds] = useState("");
  const [maxLeads, setMaxLeads] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BackfillResult | null>(null);

  const reset = () => { setResult(null); setLoading(false); };

  const handleRun = async (dryRun: boolean) => {
    if (!metaApp) return;
    setLoading(true);
    setResult(null);
    try {
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const ids = formIds.split(",").map((s) => s.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("meta-leads-backfill", {
        body: {
          source_id: metaApp.id,
          form_ids: ids.length > 0 ? ids : undefined,
          since,
          max_leads: maxLeads,
          dry_run: dryRun,
          trigger_kind: "manual",
        },
      });
      if (error) throw error;
      const r = data as BackfillResult;
      setResult(r);
      if (dryRun) {
        toast.success(`Dry-run: ${r.leads_seen} lead trovati su ${r.forms_scanned} form`);
      } else {
        toast.success(`Backfill completato: ${r.leads_inserted} nuovi (${r.leads_recovered} ingeriti)`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Backfill fallito: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Backfill lead storici
          </DialogTitle>
          <DialogDescription>
            Recupera i lead già presenti su Meta per la pagina <code>{metaApp?.page_id || "—"}</code>.
            I lead già ingeriti vengono saltati (deduplica per leadgen_id).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="days">Giorni indietro</Label>
            <Input
              id="days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 30))}
            />
            <p className="text-xs text-muted-foreground">Finestra temporale (default 30g, max 365g).</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="forms">Form ID (opzionale, virgola-separati)</Label>
            <Input
              id="forms"
              placeholder="123456789,987654321"
              value={formIds}
              onChange={(e) => setFormIds(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Vuoto = tutti i form attivi della pagina.</p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="maxleads">Limite lead per esecuzione</Label>
            <Input
              id="maxleads"
              type="number"
              min={1}
              max={5000}
              value={maxLeads}
              onChange={(e) => setMaxLeads(Math.max(1, Number(e.target.value) || 1000))}
            />
          </div>

          {result && (
            <Alert>
              <AlertDescription className="text-xs space-y-1">
                <div>Form scansionati: <b>{result.forms_scanned}</b> · pagine: <b>{result.pages_fetched}</b></div>
                <div>Lead trovati: <b>{result.leads_seen}</b> · nuovi: <b>{result.leads_inserted}</b> · duplicati: <b>{result.leads_duplicate}</b></div>
                <div>Ingeriti: <b>{result.leads_recovered}</b> · falliti: <b>{result.leads_failed}</b></div>
                {result.aborted_max_leads && <div className="text-amber-600">⚠ Limite raggiunto, alza il limite o restringi la finestra.</div>}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleRun(true)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Anteprima (dry-run)"}
          </Button>
          <Button onClick={() => handleRun(false)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Esegui backfill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
