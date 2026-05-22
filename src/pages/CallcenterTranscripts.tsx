import { useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { FileText, Phone, PhoneIncoming, PhoneOutgoing, Search, Loader2, RefreshCw, Calendar as CalIcon, MessageSquare, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCallTranscriptsList, type CallTranscriptRow } from "@/hooks/useCallTranscriptsList";
import { useBrand } from "@/contexts/BrandContext";

const SENTIMENT_OPTS: Array<{ value: string; label: string; cls: string }> = [
  { value: "very_positive", label: "Molto positivo", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  { value: "positive", label: "Positivo", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { value: "neutral", label: "Neutro", cls: "bg-muted text-muted-foreground" },
  { value: "negative", label: "Negativo", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  { value: "very_negative", label: "Molto negativo", cls: "bg-destructive/10 text-destructive" },
  { value: "undetermined", label: "Non determinato", cls: "bg-muted text-muted-foreground" },
];

const OUTCOME_OPTS: Array<{ value: string; label: string; cls: string }> = [
  { value: "confirmed", label: "Confermato", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" },
  { value: "to_callback", label: "Ricontatto", cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400" },
  { value: "appointment_rescheduled", label: "Riprogrammato", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  { value: "appointment_cancelled", label: "Annullato", cls: "bg-destructive/10 text-destructive" },
  { value: "rejection", label: "Rifiuto", cls: "bg-destructive/10 text-destructive" },
  { value: "interrupted", label: "Interrotto", cls: "bg-muted text-muted-foreground" },
];

function sentimentClass(s: string | null): string {
  return SENTIMENT_OPTS.find((o) => o.value === s)?.cls ?? "bg-muted text-muted-foreground";
}
function sentimentLabel(s: string | null): string {
  return SENTIMENT_OPTS.find((o) => o.value === s)?.label ?? (s ?? "—");
}
function outcomeClass(s: string | null): string {
  return OUTCOME_OPTS.find((o) => o.value === s)?.cls ?? "bg-muted text-muted-foreground";
}
function outcomeLabel(s: string | null): string {
  return OUTCOME_OPTS.find((o) => o.value === s)?.label ?? (s ?? "—");
}
function fmtDur(s: number | null): string {
  if (!s || s <= 0) return "—";
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

export default function CallcenterTranscripts() {
  const { currentBrand } = useBrand();
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sentiment, setSentiment] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [selected, setSelected] = useState<CallTranscriptRow | null>(null);

  const filters = useMemo(
    () => ({
      from: subDays(new Date(), days),
      to: new Date(),
      sentiment: sentiment === "all" ? null : sentiment,
      outcome: outcome === "all" ? null : outcome,
      search: search.trim() || undefined,
      limit: 200,
    }),
    [days, sentiment, outcome, search],
  );

  const { data: rows = [], isLoading, refetch, isFetching } = useCallTranscriptsList(filters);
  const total = rows[0]?.total_count ?? 0;

  const stats = useMemo(() => {
    const positives = rows.filter((r) => r.sentiment === "positive" || r.sentiment === "very_positive").length;
    const negatives = rows.filter((r) => r.sentiment === "negative" || r.sentiment === "very_negative").length;
    const confirmed = rows.filter((r) => r.call_outcome === "confirmed").length;
    return { positives, negatives, confirmed };
  }, [rows]);

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Trascrizioni & Sentiment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Whisper + analisi AI su tutte le chiamate registrate del brand {currentBrand?.name ?? ""}.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={cn("h-4 w-4 mr-2", isFetching && "animate-spin")} />
          Aggiorna
        </Button>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Totale</div><div className="text-2xl font-semibold">{total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Sentiment positivo</div><div className="text-2xl font-semibold text-emerald-600">{stats.positives}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">Sentiment negativo</div><div className="text-2xl font-semibold text-destructive">{stats.negatives}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs text-muted-foreground">App. confermati</div><div className="text-2xl font-semibold">{stats.confirmed}</div></CardContent></Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6 flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="text-xs font-medium text-muted-foreground">Cerca nel testo / riassunto</label>
            <form
              onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); }}
              className="relative mt-1"
            >
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onBlur={() => setSearch(searchInput)}
                placeholder="es. annullare, prezzo, ricontatto…"
                className="pl-9"
              />
            </form>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Periodo</label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger className="mt-1 w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Ultimi 7 giorni</SelectItem>
                <SelectItem value="14">Ultimi 14 giorni</SelectItem>
                <SelectItem value="30">Ultimi 30 giorni</SelectItem>
                <SelectItem value="90">Ultimi 90 giorni</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Sentiment</label>
            <Select value={sentiment} onValueChange={setSentiment}>
              <SelectTrigger className="mt-1 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {SENTIMENT_OPTS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Esito</label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="mt-1 w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {OUTCOME_OPTS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader><CardTitle className="text-base">Risultati ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (<Skeleton key={i} className="h-12 w-full" />))}
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p>Nessuna trascrizione nel periodo selezionato.</p>
              <p className="text-xs mt-1">Le chiamate con audio vengono processate automaticamente ogni 5 minuti.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quando</TableHead>
                  <TableHead>Operatore</TableHead>
                  <TableHead>Contatto</TableHead>
                  <TableHead>Sentiment</TableHead>
                  <TableHead>Esito</TableHead>
                  <TableHead>Durata</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} onClick={() => setSelected(r)} className="cursor-pointer">
                    <TableCell className="text-xs">
                      {r.call_started_at
                        ? format(new Date(r.call_started_at), "dd MMM, HH:mm", { locale: it })
                        : format(new Date(r.created_at), "dd MMM, HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell className="text-xs">{r.user_full_name ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      {[r.contact_first_name, r.contact_last_name].filter(Boolean).join(" ") || r.call_phone_number || "—"}
                    </TableCell>
                    <TableCell>
                      {r.sentiment ? (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", sentimentClass(r.sentiment))}>
                          {sentimentLabel(r.sentiment)}
                        </Badge>
                      ) : (<span className="text-xs text-muted-foreground">—</span>)}
                    </TableCell>
                    <TableCell>
                      {r.call_outcome ? (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", outcomeClass(r.call_outcome))}>
                          {outcomeLabel(r.call_outcome)}
                        </Badge>
                      ) : (<span className="text-xs text-muted-foreground">—</span>)}
                    </TableCell>
                    <TableCell className="text-xs">{fmtDur(r.call_duration_seconds)}</TableCell>
                    <TableCell>
                      {r.stt_status === "pending" || r.stt_status === "processing" ? (
                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-700">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />In coda
                        </Badge>
                      ) : r.stt_status === "failed" ? (
                        <Badge variant="outline" className="text-[10px] bg-destructive/10 text-destructive">
                          <AlertCircle className="h-3 w-3 mr-1" />Errore
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700">OK</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(o) => { if (!o) setSelected(null); }}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dettaglio trascrizione
            </SheetTitle>
            <SheetDescription>
              {selected?.call_started_at &&
                format(new Date(selected.call_started_at), "EEEE d MMMM yyyy 'alle' HH:mm", { locale: it })}
            </SheetDescription>
          </SheetHeader>

          {selected && (
            <div className="space-y-4 mt-4">
              {/* Meta */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><div className="text-muted-foreground">Operatore</div><div className="font-medium">{selected.user_full_name ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Contatto</div><div className="font-medium">{[selected.contact_first_name, selected.contact_last_name].filter(Boolean).join(" ") || selected.call_phone_number || "—"}</div></div>
                <div><div className="text-muted-foreground">Telefono</div><div className="font-medium">{selected.call_phone_number ?? "—"}</div></div>
                <div><div className="text-muted-foreground">Durata</div><div className="font-medium">{fmtDur(selected.call_duration_seconds)}</div></div>
                <div><div className="text-muted-foreground">Canale</div><div className="font-medium">{selected.channel ?? "call"}</div></div>
                <div><div className="text-muted-foreground">Consenso</div><div className="font-medium">{selected.consent_status}</div></div>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2">
                {selected.sentiment && (<Badge variant="outline" className={cn("text-xs", sentimentClass(selected.sentiment))}>{sentimentLabel(selected.sentiment)}{selected.sentiment_score != null && ` (${selected.sentiment_score.toFixed(2)})`}</Badge>)}
                {selected.call_outcome && (<Badge variant="outline" className={cn("text-xs", outcomeClass(selected.call_outcome))}>{outcomeLabel(selected.call_outcome)}</Badge>)}
                {selected.client_intent && (<Badge variant="outline" className="text-xs">Intento: {selected.client_intent}</Badge>)}
                {selected.decision_status && (<Badge variant="outline" className="text-xs">Decisione: {selected.decision_status}</Badge>)}
                {selected.objection_type && selected.objection_type !== "none" && (<Badge variant="outline" className="text-xs">Obiezione: {selected.objection_type}</Badge>)}
                {selected.clinical_interest && selected.clinical_interest !== "none" && (<Badge variant="outline" className="text-xs">Interesse: {selected.clinical_interest}</Badge>)}
                {selected.call_quality && (<Badge variant="outline" className="text-xs">Qualità: {selected.call_quality}</Badge>)}
              </div>

              {selected.keywords && selected.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selected.keywords.map((k, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{k}</Badge>
                  ))}
                </div>
              )}

              <Separator />

              {selected.summary && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5"><MessageSquare className="h-4 w-4" />Riassunto</h3>
                  <p className="text-sm bg-muted/40 rounded-md p-3 whitespace-pre-wrap">{selected.summary}</p>
                </div>
              )}

              {selected.notes && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Note AI</h3>
                  <p className="text-xs text-muted-foreground whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}

              {selected.full_text && (
                <div>
                  <h3 className="text-sm font-medium mb-2">Trascrizione completa</h3>
                  <p className="text-xs bg-muted/40 rounded-md p-3 whitespace-pre-wrap max-h-[400px] overflow-y-auto">
                    {selected.full_text}
                  </p>
                </div>
              )}

              {selected.stt_status === "failed" && (
                <div className="text-xs text-destructive bg-destructive/10 p-3 rounded-md">
                  Errore in fase di trascrizione/analisi. Verifica i log della funzione <code>call-transcribe</code>.
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
