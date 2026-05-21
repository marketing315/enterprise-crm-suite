/**
 * F1 — Importer CSV costi marketing.
 *
 * Granularità decisa: giorno + cost_kind + emittente (vedi mem `dashboard-performance/decisions`).
 *
 * Header CSV atteso (case-insensitive, separatore `,` o `;`):
 *   cost_date,channel,campaign,cost_kind,broadcaster,tracking_number,amount,source,notes
 *
 * - `cost_date`  obbligatorio (YYYY-MM-DD)
 * - `amount`     obbligatorio (numero, virgola o punto)
 * - `cost_kind`  media|production|agency|other (default media)
 * - `channel`    nome esatto canale del brand (case-insensitive)
 * - `campaign`   nome esatto campagna del brand (opzionale)
 * - `broadcaster` etichetta libera (mappata su `tracking_number` se combacia)
 * - `tracking_number` E.164 (collega il costo al numero verde)
 *
 * Tutto il matching è risolto client-side prima dell'insert per dare un preview chiaro.
 */
import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMarketingChannels } from "@/hooks/useMarketingChannels";
import { useMarketingCampaigns } from "@/hooks/useMarketingCampaigns";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ParsedRow = {
  line: number;
  cost_date: string;
  amount: number;
  cost_kind: "media" | "production" | "agency" | "other";
  channel_name?: string;
  campaign_name?: string;
  broadcaster?: string;
  tracking_e164?: string;
  source?: string;
  notes?: string;
  // resolved
  channel_id?: string | null;
  campaign_id?: string | null;
  tracking_number_id?: string | null;
  error?: string;
};

const COST_KINDS = ["media", "production", "agency", "other"] as const;

function splitLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === sep && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const cleaned = text.replace(/^\uFEFF/, "");
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const sep = lines[0].includes(";") && !lines[0].includes(",") ? ";" : ",";
  const headers = splitLine(lines[0], sep).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((l) => splitLine(l, sep));
  return { headers, rows };
}

export function CostCsvImportDialog({ open, onOpenChange }: Props) {
  const { currentBrand } = useBrand();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: channels } = useMarketingChannels();
  const { data: campaigns } = useMarketingCampaigns();

  const [fileName, setFileName] = useState<string>("");
  const [rawText, setRawText] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Tracking numbers del brand per matching E.164
  const { data: tns } = useQuery({
    queryKey: ["tracking-numbers-lite", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("tracking_numbers")
        .select("id,phone_e164,broadcaster,channel_id,campaign_id")
        .eq("brand_id", currentBrand.id);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!currentBrand?.id,
  });

  const parsed: ParsedRow[] = useMemo(() => {
    if (!rawText.trim()) return [];
    const { headers, rows } = parseCsv(rawText);
    if (headers.length === 0) return [];

    const idx = (k: string) => headers.indexOf(k);
    const iDate = idx("cost_date");
    const iAmount = idx("amount");
    const iKind = idx("cost_kind");
    const iCh = idx("channel");
    const iCa = idx("campaign");
    const iBr = idx("broadcaster");
    const iTn = idx("tracking_number");
    const iSrc = idx("source");
    const iNote = idx("notes");

    const chMap = new Map(
      (channels ?? []).map((c) => [c.name.toLowerCase(), c.id])
    );
    const caMap = new Map(
      (campaigns ?? []).map((c) => [c.name.toLowerCase(), c])
    );
    const tnMap = new Map((tns ?? []).map((t) => [t.phone_e164, t]));

    return rows.map((cols, r): ParsedRow => {
      const line = r + 2;
      const get = (i: number) => (i >= 0 ? (cols[i] ?? "").trim() : "");

      const cost_date = get(iDate);
      const amountRaw = get(iAmount).replace(/\s/g, "").replace(",", ".");
      const amount = Number(amountRaw);
      const kindRaw = (get(iKind) || "media").toLowerCase();
      const kind = (COST_KINDS as readonly string[]).includes(kindRaw)
        ? (kindRaw as ParsedRow["cost_kind"])
        : "media";

      const channel_name = get(iCh) || undefined;
      const campaign_name = get(iCa) || undefined;
      const broadcaster = get(iBr) || undefined;
      const tracking_e164 = get(iTn) || undefined;

      let error: string | undefined;
      if (!cost_date || !/^\d{4}-\d{2}-\d{2}$/.test(cost_date))
        error = "cost_date mancante o non in formato YYYY-MM-DD";
      else if (!Number.isFinite(amount) || amount < 0)
        error = "amount non valido";

      // Resolve mappings
      let channel_id: string | null | undefined = undefined;
      if (channel_name) {
        channel_id = chMap.get(channel_name.toLowerCase()) ?? null;
        if (channel_id === null) error = error ?? `canale "${channel_name}" non trovato`;
      }

      let campaign_id: string | null | undefined = undefined;
      if (campaign_name) {
        const c = caMap.get(campaign_name.toLowerCase());
        campaign_id = c?.id ?? null;
        if (campaign_id === null) error = error ?? `campagna "${campaign_name}" non trovata`;
        if (c && !channel_id) channel_id = c.channel_id ?? null;
      }

      let tracking_number_id: string | null | undefined = undefined;
      if (tracking_e164) {
        const t = tnMap.get(tracking_e164);
        tracking_number_id = t?.id ?? null;
        if (tracking_number_id === null)
          error = error ?? `tracking_number "${tracking_e164}" non trovato`;
        if (t && !channel_id) channel_id = t.channel_id ?? null;
      }

      return {
        line,
        cost_date,
        amount,
        cost_kind: kind,
        channel_name,
        campaign_name,
        broadcaster,
        tracking_e164,
        source: get(iSrc) || undefined,
        notes: get(iNote) || undefined,
        channel_id,
        campaign_id,
        tracking_number_id,
        error,
      };
    });
  }, [rawText, channels, campaigns, tns]);

  const validRows = parsed.filter((r) => !r.error);
  const errorRows = parsed.filter((r) => r.error);
  const totalAmount = validRows.reduce((s, r) => s + r.amount, 0);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setFileName(file.name);
    const txt = await file.text();
    setRawText(txt);
  };

  const handleImport = async () => {
    if (!currentBrand?.id || !user) {
      toast.error("Brand o utente non disponibili");
      return;
    }
    if (validRows.length === 0) {
      toast.error("Nessuna riga valida da importare");
      return;
    }
    setSubmitting(true);
    try {
      const batchId = crypto.randomUUID();
      const payload = validRows.map((r) => ({
        brand_id: currentBrand.id,
        created_by: user.id,
        cost_date: r.cost_date,
        amount: r.amount,
        cost_kind: r.cost_kind,
        channel_id: r.channel_id ?? null,
        campaign_id: r.campaign_id ?? null,
        tracking_number_id: r.tracking_number_id ?? null,
        source: r.source ?? "csv-import",
        notes: r.broadcaster
          ? `${r.notes ? r.notes + " · " : ""}emittente: ${r.broadcaster}`
          : (r.notes ?? null),
        import_batch_id: batchId,
      }));
      const { error } = await supabase.from("marketing_costs").insert(payload);
      if (error) throw error;
      toast.success(`Importate ${payload.length} righe (batch ${batchId.slice(0, 8)})`);
      qc.invalidateQueries({ queryKey: ["marketing-costs"] });
      qc.invalidateQueries({ queryKey: ["channel-performance"] });
      qc.invalidateQueries({ queryKey: ["marketing-kpis"] });
      onOpenChange(false);
      setRawText("");
      setFileName("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Errore import";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Importa costi marketing da CSV</DialogTitle>
          <DialogDescription>
            Una riga per giorno × canale × <code>cost_kind</code> × emittente. Header:&nbsp;
            <code className="text-xs">
              cost_date,channel,campaign,cost_kind,broadcaster,tracking_number,amount,source,notes
            </code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="csv-file">File CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
            )}
          </div>

          {parsed.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{parsed.length} righe lette</Badge>
              <Badge variant="default" className="bg-emerald-600">
                <CheckCircle2 className="w-3 h-3 mr-1" />
                {validRows.length} valide
              </Badge>
              {errorRows.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {errorRows.length} con errori
                </Badge>
              )}
              <Badge variant="outline">
                Totale: € {totalAmount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
              </Badge>
            </div>
          )}

          {errorRows.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Righe scartate</AlertTitle>
              <AlertDescription>
                <ScrollArea className="max-h-32">
                  <ul className="text-xs space-y-0.5">
                    {errorRows.slice(0, 20).map((r) => (
                      <li key={r.line}>
                        riga {r.line}: {r.error}
                      </li>
                    ))}
                    {errorRows.length > 20 && (
                      <li>… +{errorRows.length - 20} altre</li>
                    )}
                  </ul>
                </ScrollArea>
              </AlertDescription>
            </Alert>
          )}

          {validRows.length > 0 && (
            <div className="border rounded-md">
              <ScrollArea className="max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Data</th>
                      <th className="text-left p-2">Canale</th>
                      <th className="text-left p-2">Campagna</th>
                      <th className="text-left p-2">Kind</th>
                      <th className="text-left p-2">Emittente</th>
                      <th className="text-right p-2">Importo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 50).map((r) => (
                      <tr key={r.line} className="border-t">
                        <td className="p-2">{r.cost_date}</td>
                        <td className="p-2">{r.channel_name ?? "—"}</td>
                        <td className="p-2">{r.campaign_name ?? "—"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {r.cost_kind}
                          </Badge>
                        </td>
                        <td className="p-2">{r.broadcaster ?? "—"}</td>
                        <td className="p-2 text-right tabular-nums">
                          € {r.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 50 && (
                  <p className="text-xs text-muted-foreground p-2">
                    …mostrate prime 50 di {validRows.length}
                  </p>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={handleImport}
            disabled={submitting || validRows.length === 0}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Import…
              </>
            ) : (
              <>
                <Upload className="w-4 h-4 mr-2" />
                Importa {validRows.length} righe
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CostCsvImportDialog;
