import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Upload, FileArchive, AlertTriangle, CheckCircle2, Loader2, ShieldAlert, Eye, Play, RotateCcw,
} from "lucide-react";
import { useRunRestore, useRestoreRuns, RestoreResult } from "@/hooks/useQuickRestore";
import { format } from "date-fns";
import { it } from "date-fns/locale";

function formatNum(n: number): string {
  return n.toLocaleString("it-IT");
}
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

// F5: Hard caps on restore upload to prevent OOM / DoS via crafted archives.
const MAX_RESTORE_FILE_BYTES = 100 * 1024 * 1024; // 100 MB
const ALLOWED_RESTORE_MIME = new Set([
  "application/gzip",
  "application/x-gzip",
  "application/x-tar",
  "application/x-compressed-tar",
  "application/octet-stream", // some browsers don't sniff .tar.gz
  "", // Safari often returns empty type
]);
const ALLOWED_RESTORE_EXT_RE = /\.(tar\.gz|tgz|gz)$/i;

export function RestorePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestoreResult | null>(null);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [conflictStrategy, setConflictStrategy] = useState<"skip" | "overwrite">("skip");
  const fileInput = useRef<HTMLInputElement>(null);

  const { data: runs = [], isLoading: runsLoading } = useRestoreRuns();
  const restore = useRunRestore();

  const isPreviewing = restore.isPending && restore.variables?.mode === "dry_run";
  const isApplying = restore.isPending && restore.variables?.mode === "apply";

  const handleFile = (f: File | null) => {
    setPreview(null);
    setSelectedTables(new Set());
    setFileError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > MAX_RESTORE_FILE_BYTES) {
      setFile(null);
      setFileError(
        `File troppo grande (${(f.size / 1024 / 1024).toFixed(1)} MB). Massimo ${MAX_RESTORE_FILE_BYTES / 1024 / 1024} MB.`,
      );
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    const mimeOk = ALLOWED_RESTORE_MIME.has(f.type);
    const extOk = ALLOWED_RESTORE_EXT_RE.test(f.name);
    if (!mimeOk || !extOk) {
      setFile(null);
      setFileError(
        `Formato non valido. Atteso .tar.gz / .tgz / .gz (ricevuto: ${f.type || "tipo sconosciuto"}).`,
      );
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setFile(f);
  };

  const handlePreview = async () => {
    if (!file) return;
    const res = await restore.mutateAsync({ file, mode: "dry_run" });
    setPreview(res);
    // pre-seleziono tabelle con righe da inserire
    setSelectedTables(
      new Set(
        res.summary.filter((s) => (s.would_insert ?? 0) > 0).map((s) => s.table)
      )
    );
  };

  const handleApply = async () => {
    if (!file || !preview) return;
    const res = await restore.mutateAsync({
      file,
      mode: "apply",
      conflictStrategy,
      tables: Array.from(selectedTables),
    });
    setPreview(res);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSelectedTables(new Set());
    if (fileInput.current) fileInput.current.value = "";
  };

  const toggleTable = (t: string) => {
    setSelectedTables((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const totalSelectedRows = preview?.summary
    .filter((s) => selectedTables.has(s.table))
    .reduce((sum, s) => sum + (s.would_insert ?? 0), 0) ?? 0;

  return (
    <div className="space-y-6">
      <Alert variant="default" className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
        <ShieldAlert className="h-4 w-4 text-amber-600" />
        <AlertTitle>Restore additivo, non distruttivo</AlertTitle>
        <AlertDescription>
          Il restore inserisce righe nuove nel brand corrente. La strategia <strong>"Salta conflitti"</strong> (default)
          non sovrascrive righe esistenti. Le tabelle append-only (audit, lead_events, deal_stage_history, appointment_outcomes)
          sono sempre forzate a "Salta" anche se selezioni "Sovrascrivi". Operazione tracciata in <code>restore_runs</code>.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>1. Carica archivio</CardTitle>
          <CardDescription>
            File <code>.tar.gz</code> generato da "Genera backup". Il <code>brand_id</code> nelle righe
            sarà forzato al brand corrente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInput}
              type="file"
              accept=".tar.gz,.gz,application/gzip"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 file:cursor-pointer"
            />
            {file && (
              <>
                <Badge variant="secondary" className="gap-1">
                  <FileArchive className="h-3 w-3" /> {file.name} • {formatBytes(file.size)}
                </Badge>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Annulla
                </Button>
              </>
            )}
          </div>

          {fileError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>File non accettato</AlertTitle>
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              onClick={handlePreview}
              disabled={!file || restore.isPending}
              variant="outline"
            >
              {isPreviewing ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisi…</>
              ) : (
                <><Eye className="h-4 w-4 mr-2" /> Anteprima (dry-run)</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>2. Anteprima contenuto archivio</CardTitle>
            <CardDescription className="space-y-1">
              <div>
                Sorgente: brand <code className="text-xs">{preview.manifest.source_brand_id?.slice(0, 8)}…</code>
                {" "}• scope <Badge variant="outline" className="text-[10px] ml-1">{preview.manifest.source_scope}</Badge>
                {" "}• generato il {format(new Date(preview.manifest.generated_at), "d MMM yyyy HH:mm", { locale: it })}
              </div>
              <div>
                Totale righe nell'archivio: <strong>{formatNum(preview.total_in_archive)}</strong>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"></TableHead>
                  <TableHead>Tabella</TableHead>
                  <TableHead className="text-right">Righe archivio</TableHead>
                  <TableHead className="text-right">Conflitti (id già presenti)</TableHead>
                  <TableHead className="text-right">Inseribili (skip)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.summary.map((s) => {
                  const conflicts = s.conflicts ?? 0;
                  const wouldInsert = s.would_insert ?? 0;
                  return (
                    <TableRow key={s.table}>
                      <TableCell>
                        <Checkbox
                          checked={selectedTables.has(s.table)}
                          onCheckedChange={() => toggleTable(s.table)}
                          disabled={preview.mode === "apply"}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.table}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNum(s.in_archive)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {conflicts > 0 ? (
                          <Badge variant="outline" className="text-[10px]">{formatNum(conflicts)}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {preview.mode === "apply" ? (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> {formatNum(s.inserted ?? 0)} inseriti
                          </Badge>
                        ) : (
                          <strong>{formatNum(wouldInsert)}</strong>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {preview.mode === "dry_run" && (
              <div className="space-y-3 pt-3 border-t">
                <div className="space-y-2">
                  <Label className="text-sm">Strategia di conflitto</Label>
                  <RadioGroup
                    value={conflictStrategy}
                    onValueChange={(v) => setConflictStrategy(v as "skip" | "overwrite")}
                    className="flex gap-4"
                  >
                    <Label htmlFor="cs-skip" className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="skip" id="cs-skip" />
                      <span className="text-sm">Salta conflitti (consigliato)</span>
                    </Label>
                    <Label htmlFor="cs-overwrite" className="flex items-center gap-2 cursor-pointer">
                      <RadioGroupItem value="overwrite" id="cs-overwrite" />
                      <span className="text-sm">Sovrascrivi (UPSERT) — non si applica alle tabelle append-only</span>
                    </Label>
                  </RadioGroup>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      disabled={selectedTables.size === 0 || restore.isPending}
                      variant="default"
                      size="lg"
                    >
                      {isApplying ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restore in corso…</>
                      ) : (
                        <><Play className="h-4 w-4 mr-2" /> Esegui restore ({selectedTables.size} tabelle, {formatNum(totalSelectedRows)} righe)</>
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confermi il restore?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Stai per inserire <strong>{formatNum(totalSelectedRows)}</strong> righe nel brand corrente,
                        distribuite su <strong>{selectedTables.size}</strong> tabelle.
                        {conflictStrategy === "overwrite" && (
                          <span className="block mt-2 text-amber-600">
                            ⚠️ Hai selezionato "Sovrascrivi": le righe esistenti con lo stesso id verranno aggiornate
                            (eccetto le tabelle append-only).
                          </span>
                        )}
                        {" "}L'azione sarà tracciata in <code>restore_runs</code>.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={handleApply}>
                        Sì, esegui restore
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}

            {preview.mode === "apply" && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Restore completato</AlertTitle>
                <AlertDescription>
                  {formatNum(preview.total_inserted)} righe inserite • {formatNum(preview.total_skipped)} saltate •
                  durata {(preview.duration_ms / 1000).toFixed(1)}s
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Storico restore</CardTitle>
          <CardDescription>Ultimi 50 restore (anteprime e applicati).</CardDescription>
        </CardHeader>
        <CardContent>
          {runsLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Nessun restore eseguito.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Modalità</TableHead>
                  <TableHead>Strategia</TableHead>
                  <TableHead>Sorgente</TableHead>
                  <TableHead className="text-right">Inseriti</TableHead>
                  <TableHead className="text-right">Saltati</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {format(new Date(r.created_at), "d MMM HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.mode === "apply" ? "default" : "outline"} className="text-[10px]">
                        {r.mode === "apply" ? "Restore" : "Anteprima"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.conflict_strategy}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {r.source_brand_id ? `${r.source_brand_id.slice(0, 8)}…` : "—"}
                      {r.source_scope && <span className="ml-1">/ {r.source_scope}</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatNum(r.total_rows_inserted)}</TableCell>
                    <TableCell className="text-right tabular-nums text-sm">{formatNum(r.total_rows_skipped)}</TableCell>
                    <TableCell>
                      {r.status === "completed" ? (
                        <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />ok</Badge>
                      ) : r.status === "failed" ? (
                        <Badge variant="destructive" title={r.error ?? ""}>
                          <AlertTriangle className="h-3 w-3 mr-1" />fallito
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />in corso</Badge>
                      )}
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
