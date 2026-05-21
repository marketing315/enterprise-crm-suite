import { useCallback, useMemo, useState } from "react";
import axe, { type AxeResults, type Result, type ImpactValue } from "axe-core";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Loader2, Download, FileJson, FileText, Play, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * H11+ — Audit Accessibilità Automatizzato
 *
 * Esegue axe-core sul DOM corrente (l'app è una SPA, quindi axe vede tutti i
 * componenti già renderizzati nel layout admin) con regolamento WCAG 2.1
 * AA o AA+ (AAA), produce un log dettagliato e due report scaricabili
 * (JSON axe-standard + Markdown executive).
 *
 * NB: lo scan opera sull'iframe di preview del browser corrente; per
 * coprire route diverse, naviga prima alla pagina target e poi torna qui.
 */

type Level = "AA" | "AAA";

const LEVEL_TAGS: Record<Level, string[]> = {
  AA: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
  AAA: ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag21aaa", "best-practice"],
};

const IMPACT_ORDER: ImpactValue[] = ["critical", "serious", "moderate", "minor"];

const IMPACT_BADGE: Record<ImpactValue, { label: string; variant: "destructive" | "default" | "secondary" | "outline" }> = {
  critical: { label: "Critico", variant: "destructive" },
  serious: { label: "Serio", variant: "destructive" },
  moderate: { label: "Moderato", variant: "default" },
  minor: { label: "Minore", variant: "secondary" },
};

interface RunMeta {
  level: Level;
  url: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

function impactRank(i: ImpactValue | null | undefined): number {
  if (!i) return 99;
  const idx = IMPACT_ORDER.indexOf(i);
  return idx === -1 ? 99 : idx;
}

function sortByImpact(a: Result, b: Result): number {
  return impactRank(a.impact) - impactRank(b.impact);
}

function downloadBlob(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildMarkdown(results: AxeResults, meta: RunMeta): string {
  const lines: string[] = [];
  lines.push(`# Audit Accessibilità — WCAG ${meta.level}`);
  lines.push("");
  lines.push(`- **URL**: ${meta.url}`);
  lines.push(`- **Avviato**: ${meta.startedAt}`);
  lines.push(`- **Concluso**: ${meta.finishedAt}`);
  lines.push(`- **Durata**: ${(meta.durationMs / 1000).toFixed(2)}s`);
  lines.push(`- **axe-core**: ${results.testEngine.version}`);
  lines.push("");
  lines.push(`## Sintesi`);
  lines.push("");
  lines.push(`| Stato | Conteggio |`);
  lines.push(`|---|---:|`);
  lines.push(`| Violazioni | ${results.violations.length} |`);
  lines.push(`| Da verificare manualmente | ${results.incomplete.length} |`);
  lines.push(`| Conformi | ${results.passes.length} |`);
  lines.push(`| Non applicabili | ${results.inapplicable.length} |`);
  lines.push("");

  const byImpact = results.violations.reduce<Record<string, number>>((acc, v) => {
    const k = v.impact ?? "unknown";
    acc[k] = (acc[k] ?? 0) + v.nodes.length;
    return acc;
  }, {});
  if (Object.keys(byImpact).length) {
    lines.push(`### Violazioni per severità (nodi colpiti)`);
    lines.push("");
    for (const k of IMPACT_ORDER) {
      if (byImpact[k]) lines.push(`- **${IMPACT_BADGE[k].label}**: ${byImpact[k]}`);
    }
    lines.push("");
  }

  if (results.violations.length) {
    lines.push(`## Violazioni`);
    lines.push("");
    for (const v of [...results.violations].sort(sortByImpact)) {
      const impact = v.impact ?? "minor";
      lines.push(`### [${IMPACT_BADGE[impact].label}] ${v.id} — ${v.help}`);
      lines.push("");
      lines.push(`- **Descrizione**: ${v.description}`);
      lines.push(`- **WCAG tags**: ${v.tags.filter((t) => t.startsWith("wcag")).join(", ") || "—"}`);
      lines.push(`- **Doc**: ${v.helpUrl}`);
      lines.push(`- **Nodi**: ${v.nodes.length}`);
      v.nodes.slice(0, 10).forEach((n, i) => {
        lines.push(`  ${i + 1}. \`${n.target.join(" ")}\``);
        if (n.failureSummary) {
          lines.push(`     - ${n.failureSummary.replace(/\n/g, " ")}`);
        }
      });
      if (v.nodes.length > 10) lines.push(`  …(+${v.nodes.length - 10} altri nodi)`);
      lines.push("");
    }
  }

  if (results.incomplete.length) {
    lines.push(`## Da verificare manualmente`);
    lines.push("");
    for (const v of results.incomplete) {
      lines.push(`- **${v.id}** — ${v.help} (${v.nodes.length} nodi) — ${v.helpUrl}`);
    }
  }

  return lines.join("\n");
}

export default function AdminA11yAudit() {
  const [level, setLevel] = useState<Level>("AA");
  const [scope, setScope] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AxeResults | null>(null);
  const [meta, setMeta] = useState<RunMeta | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    const startedAt = new Date();
    try {
      let context: Document | Element = document;
      if (scope.trim()) {
        const el = document.querySelector(scope.trim());
        if (!el) {
          toast.error(`Selettore non trovato: ${scope}`);
          setRunning(false);
          return;
        }
        context = el;
      }
      const res = await axe.run(context, {
        runOnly: { type: "tag", values: LEVEL_TAGS[level] },
        resultTypes: ["violations", "incomplete", "passes", "inapplicable"],
      });
      const finishedAt = new Date();
      setResults(res);
      setMeta({
        level,
        url: window.location.href,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });
      toast.success(
        `Scan completato — ${res.violations.length} violazioni, ${res.incomplete.length} da verificare`,
      );
    } catch (e) {
      toast.error(`Errore axe-core: ${(e as Error).message}`);
    } finally {
      setRunning(false);
    }
  }, [level, scope]);

  const summary = useMemo(() => {
    if (!results) return null;
    const byImpact: Record<string, number> = {};
    for (const v of results.violations) {
      const k = v.impact ?? "unknown";
      byImpact[k] = (byImpact[k] ?? 0) + v.nodes.length;
    }
    return {
      violations: results.violations.length,
      incomplete: results.incomplete.length,
      passes: results.passes.length,
      inapplicable: results.inapplicable.length,
      byImpact,
    };
  }, [results]);

  const onDownloadJson = useCallback(() => {
    if (!results || !meta) return;
    const filename = `a11y-${meta.level}-${meta.startedAt.replace(/[:.]/g, "-")}.json`;
    downloadBlob(JSON.stringify({ meta, results }, null, 2), "application/json", filename);
  }, [results, meta]);

  const onDownloadMd = useCallback(() => {
    if (!results || !meta) return;
    const filename = `a11y-${meta.level}-${meta.startedAt.replace(/[:.]/g, "-")}.md`;
    downloadBlob(buildMarkdown(results, meta), "text/markdown", filename);
  }, [results, meta]);

  const sortedViolations = useMemo(
    () => (results ? [...results.violations].sort(sortByImpact) : []),
    [results],
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Helmet>
        <title>Audit Accessibilità — WCAG AA/AAA</title>
      </Helmet>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Audit Accessibilità</h1>
        <p className="text-sm text-muted-foreground">
          Scan automatico WCAG 2.1 con axe-core {axe.version}. Esegui un livello
          alla volta, naviga sulle route da auditare e ri-lancia lo scan; scarica il
          report JSON (machine-readable) o Markdown (executive).
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Esegui scan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[160px_1fr_auto] items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="level">
                Livello WCAG
              </label>
              <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
                <SelectTrigger id="level"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AA">AA (raccomandato)</SelectItem>
                  <SelectItem value="AAA">AA+ / AAA (massimo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium" htmlFor="scope">
                Selettore CSS (opzionale) — limita lo scan a un sotto-albero
              </label>
              <Input
                id="scope"
                placeholder="es. main, #app, [data-testid='dashboard']"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
              />
            </div>
            <Button onClick={run} disabled={running} aria-label="Esegui scan">
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? "Scansione…" : "Esegui scan"}
            </Button>
          </div>

          {meta && (
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">URL: {meta.url}</Badge>
              <Badge variant="outline">Livello: {meta.level}</Badge>
              <Badge variant="outline">Durata: {(meta.durationMs / 1000).toFixed(2)}s</Badge>
              <Badge variant="outline">{meta.startedAt}</Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && results && meta && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Violazioni</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  <span className="text-3xl font-semibold tabular-nums">{summary.violations}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {IMPACT_ORDER.map((k) =>
                    summary.byImpact[k] ? (
                      <Badge key={k} variant={IMPACT_BADGE[k].variant}>
                        {IMPACT_BADGE[k].label}: {summary.byImpact[k]}
                      </Badge>
                    ) : null,
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Da verificare</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold tabular-nums">{summary.incomplete}</span>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Conformi</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-3xl font-semibold tabular-nums">{summary.passes}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Non applicabili</CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-3xl font-semibold tabular-nums">{summary.inapplicable}</span>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onDownloadJson} aria-label="Scarica JSON">
              <FileJson /> Report JSON
            </Button>
            <Button variant="outline" onClick={onDownloadMd} aria-label="Scarica Markdown">
              <FileText /> Report Markdown
            </Button>
            <Button variant="outline" onClick={() => downloadBlob(JSON.stringify(results, null, 2), "application/json", "axe-raw.json")} aria-label="Scarica raw axe">
              <Download /> Raw axe JSON
            </Button>
          </div>

          <Tabs defaultValue="violations">
            <TabsList>
              <TabsTrigger value="violations">Violazioni ({summary.violations})</TabsTrigger>
              <TabsTrigger value="incomplete">Da verificare ({summary.incomplete})</TabsTrigger>
              <TabsTrigger value="passes">Conformi ({summary.passes})</TabsTrigger>
            </TabsList>

            <TabsContent value="violations" className="space-y-2">
              {sortedViolations.length === 0 ? (
                <Card><CardContent className="pt-6 text-sm text-muted-foreground">
                  Nessuna violazione rilevata su questo scope. 🎉
                </CardContent></Card>
              ) : (
                <Accordion type="multiple" className="space-y-2">
                  {sortedViolations.map((v) => {
                    const impact = v.impact ?? "minor";
                    return (
                      <AccordionItem key={v.id} value={v.id} className="border rounded-lg px-3">
                        <AccordionTrigger className="hover:no-underline">
                          <div className="flex items-center gap-3 text-left flex-1 min-w-0">
                            <Badge variant={IMPACT_BADGE[impact].variant}>{IMPACT_BADGE[impact].label}</Badge>
                            <span className="font-medium truncate">{v.help}</span>
                            <Badge variant="outline" className="ml-auto shrink-0">{v.nodes.length} nodi</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-3 text-sm">
                          <p className="text-muted-foreground">{v.description}</p>
                          <div className="flex flex-wrap gap-1">
                            {v.tags.filter((t) => t.startsWith("wcag")).map((t) => (
                              <Badge key={t} variant="outline">{t}</Badge>
                            ))}
                            <a className="text-xs underline ml-auto" href={v.helpUrl} target="_blank" rel="noopener noreferrer">
                              Docs ↗
                            </a>
                          </div>
                          <ul className="space-y-2">
                            {v.nodes.slice(0, 20).map((n, i) => (
                              <li key={i} className="border-l-2 pl-3 py-1">
                                <code className="text-xs break-all">{n.target.join(" ")}</code>
                                {n.failureSummary && (
                                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                    {n.failureSummary}
                                  </p>
                                )}
                              </li>
                            ))}
                            {v.nodes.length > 20 && (
                              <li className="text-xs text-muted-foreground">
                                …(+{v.nodes.length - 20} altri nodi nel report scaricabile)
                              </li>
                            )}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </TabsContent>

            <TabsContent value="incomplete" className="space-y-2">
              {results.incomplete.length === 0 ? (
                <Card><CardContent className="pt-6 text-sm text-muted-foreground">Nulla da verificare manualmente.</CardContent></Card>
              ) : (
                <ul className="space-y-1 text-sm">
                  {results.incomplete.map((v) => (
                    <li key={v.id} className="border rounded p-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{v.id}</span>
                        <Badge variant="outline">{v.nodes.length} nodi</Badge>
                        <a className="ml-auto text-xs underline" href={v.helpUrl} target="_blank" rel="noopener noreferrer">Docs ↗</a>
                      </div>
                      <p className="text-muted-foreground text-xs mt-1">{v.help}</p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="passes">
              <ul className="text-xs space-y-1 text-muted-foreground max-h-96 overflow-auto border rounded p-3">
                {results.passes.map((v) => (
                  <li key={v.id}>✓ <span className="font-mono">{v.id}</span> — {v.help} ({v.nodes.length})</li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
