import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  useAIDecisionsDrilldown,
  useAIDecisionsFilterOptions,
  type AIDecisionRow,
} from "@/hooks/useAIDecisionsDrilldown";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Brain, ArrowLeft, ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { arrayToCSV, downloadCSV } from "@/lib/csvExport";
import { toast } from "sonner";

const ANY = "__any__";
const PAGE_SIZE = 50;

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value == null) return <Badge variant="outline">n/d</Badge>;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? "default" : pct >= 50 ? "secondary" : "destructive";
  return <Badge variant={tone as never}>{pct}%</Badge>;
}

function DecisionRow({ row }: { row: AIDecisionRow }) {
  return (
    <div className="border-b last:border-0 py-3 px-4 hover:bg-muted/40 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            {row.was_overridden ? (
              <Badge variant="destructive" className="text-xs flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> override
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" /> accettata
              </Badge>
            )}
            <span className="font-mono text-xs text-muted-foreground">{row.model_version}</span>
            <ConfidenceBadge value={row.confidence} />
            {row.initial_stage_name && (
              <Badge variant="outline" className="text-xs">{row.initial_stage_name}</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {format(new Date(row.created_at), "dd MMM HH:mm", { locale: it })}
            </span>
          </div>
          <p className="text-sm leading-snug">{row.rationale}</p>
          {row.was_overridden && (row.override_reason || row.override_reason_category) && (
            <div className="text-xs text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-md p-2 mt-1">
              <span className="font-medium text-destructive">Motivo override:</span>{" "}
              {row.override_reason_category && <span>[{row.override_reason_category}] </span>}
              {row.override_reason ?? "—"}
              {row.overridden_by_name && <span> — di {row.overridden_by_name}</span>}
            </div>
          )}
        </div>
        <Link
          to={`/contacts?lead_event_id=${row.lead_event_id}`}
          className="text-xs text-primary hover:underline whitespace-nowrap"
        >
          Vedi lead →
        </Link>
      </div>
    </div>
  );
}

export default function AdminAIDecisionsDrilldown() {
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(0);

  const days = Number(params.get("days") ?? 30);
  const modelVersion = params.get("model");
  const initialStage = params.get("stage");
  const overriddenByUserId = params.get("user");
  const onlyOverridden =
    params.get("overridden") === "1" ? true : params.get("overridden") === "0" ? false : null;

  const { data: options } = useAIDecisionsFilterOptions(days);
  const { data, isLoading } = useAIDecisionsDrilldown({
    days,
    modelVersion,
    initialStage,
    overriddenByUserId,
    onlyOverridden,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const totalPages = useMemo(() => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)), [data]);

  const update = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v === null || v === ANY) next.delete(k);
    else next.set(k, v);
    setParams(next, { replace: true });
    setPage(0);
  };

  const handleExportCSV = () => {
    const rows = data?.rows ?? [];
    if (rows.length === 0) {
      toast.error("Nessuna riga da esportare con i filtri attuali");
      return;
    }
    const csv = arrayToCSV(
      rows.map((r) => ({
        data: format(new Date(r.created_at), "yyyy-MM-dd HH:mm:ss"),
        brand: r.brand_name ?? "",
        modello: r.model_version,
        prompt: r.prompt_version,
        confidenza_pct: r.confidence != null ? Math.round(r.confidence * 100) : "",
        stage_iniziale: r.initial_stage_name ?? "",
        lead_type: r.lead_type,
        priorita: r.priority,
        overridden: r.was_overridden ? "si" : "no",
        override_categoria: r.override_reason_category ?? "",
        override_motivo: r.override_reason ?? "",
        override_da: r.overridden_by_name ?? "",
        crea_ticket: r.should_create_ticket ? "si" : "no",
        azione_appuntamento: r.appointment_action ?? "",
        tags: (r.tags_to_apply ?? []).join("|"),
        rationale: r.rationale,
      })),
      [
        { key: "data", label: "Data" },
        { key: "brand", label: "Brand" },
        { key: "modello", label: "Modello" },
        { key: "prompt", label: "Prompt version" },
        { key: "confidenza_pct", label: "Confidenza %" },
        { key: "stage_iniziale", label: "Stage iniziale" },
        { key: "lead_type", label: "Lead type" },
        { key: "priorita", label: "Priorità" },
        { key: "overridden", label: "Overridden" },
        { key: "override_categoria", label: "Categoria override" },
        { key: "override_motivo", label: "Motivo override" },
        { key: "override_da", label: "Override da" },
        { key: "crea_ticket", label: "Crea ticket" },
        { key: "azione_appuntamento", label: "Azione appuntamento" },
        { key: "tags", label: "Tags" },
        { key: "rationale", label: "Rationale" },
      ],
    );
    const ts = format(new Date(), "yyyyMMdd-HHmm");
    downloadCSV(csv, `ai-decisions-${ts}.csv`);
    toast.success(`Esportate ${rows.length} decisioni (pagina corrente)`);
  };

  return (
    <div className="container max-w-6xl py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/ai-metrics">
            <ArrowLeft className="h-4 w-4 mr-1" /> Torna alle metriche AI
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Brain className="h-7 w-7 text-primary" />
          Decisioni AI — drilldown
        </h1>
        <p className="text-muted-foreground mt-1">
          Esplora le singole decisioni dell'AI Agent con filtri per modello, stage e utente che ha applicato l'override.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filtri</CardTitle>
          <CardDescription>Si applicano live e aggiornano l'URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Periodo</Label>
            <Select value={String(days)} onValueChange={(v) => update("days", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 giorni</SelectItem>
                <SelectItem value="30">30 giorni</SelectItem>
                <SelectItem value="90">90 giorni</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Modello</Label>
            <Select value={modelVersion ?? ANY} onValueChange={(v) => update("model", v)}>
              <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti</SelectItem>
                {(options?.models ?? []).map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Stage iniziale</Label>
            <Select value={initialStage ?? ANY} onValueChange={(v) => update("stage", v)}>
              <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti</SelectItem>
                {(options?.stages ?? []).map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Override da</Label>
            <Select value={overriddenByUserId ?? ANY} onValueChange={(v) => update("user", v)}>
              <SelectTrigger><SelectValue placeholder="Tutti" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Tutti</SelectItem>
                {(options?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1 flex flex-col justify-end">
            <Label className="text-xs">Solo overridden</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch
                checked={onlyOverridden === true}
                onCheckedChange={(v) => update("overridden", v ? "1" : null)}
              />
              <span className="text-sm text-muted-foreground">
                {onlyOverridden ? "attivo" : "off"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between">
          <CardTitle className="text-base">
            Decisioni{" "}
            <span className="text-muted-foreground font-normal">
              ({data?.total ?? 0} risultati)
            </span>
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <Button
              size="sm"
              variant="outline"
              onClick={handleExportCSV}
              disabled={isLoading || (data?.rows.length ?? 0) === 0}
              className="gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Esporta CSV</span>
            </Button>
            <Button
              size="icon"
              variant="ghost"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
             aria-label="Indietro">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              {page + 1} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="ghost"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Avanti"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          )}
          {!isLoading && (data?.rows.length ?? 0) === 0 && (
            <p className="py-12 text-center text-muted-foreground text-sm">
              Nessuna decisione corrisponde ai filtri.
            </p>
          )}
          {!isLoading && data?.rows.map((row) => <DecisionRow key={row.id} row={row} />)}
        </CardContent>
      </Card>
    </div>
  );
}
