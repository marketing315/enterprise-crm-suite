import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBackupRuns, useRunQuickBackup, SCOPE_DESCRIPTIONS, BackupScope } from "@/hooks/useQuickBackup";
import { useBrand } from "@/contexts/BrandContext";
import { Database, Download, AlertTriangle, CheckCircle2, Loader2, Shield, Upload } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { RestorePanel } from "@/components/admin/RestorePanel";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export default function AdminQuickBackup() {
  const { currentBrand } = useBrand();
  const [scope, setScope] = useState<BackupScope>("standard");
  const { data: runs = [], isLoading } = useBackupRuns();
  const runBackup = useRunQuickBackup();

  return (
    <div className="container max-w-5xl py-8 space-y-8">
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Database className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Backup rapido</h1>
            <p className="text-muted-foreground">
              Esporta uno snapshot delle tabelle business del brand corrente.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="backup" className="space-y-6">
        <TabsList>
          <TabsTrigger value="backup" className="gap-2">
            <Download className="h-4 w-4" /> Backup
          </TabsTrigger>
          <TabsTrigger value="restore" className="gap-2">
            <Upload className="h-4 w-4" /> Restore
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backup" className="space-y-6">
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Backup logico, non sostituisce il PITR</AlertTitle>
            <AlertDescription>
              Per il recovery completo da incidente usa la procedura PITR documentata in{" "}
              <code className="text-xs">docs/dr/02-pitr-restore.md</code>. Questo backup serve per
              export rapido, audit, migrazioni e safety net prima di operazioni rischiose.
            </AlertDescription>
          </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Genera nuovo backup</CardTitle>
          <CardDescription>
            Brand: <span className="font-medium text-foreground">{currentBrand?.name ?? "—"}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <RadioGroup
            value={scope}
            onValueChange={(v) => setScope(v as BackupScope)}
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
          >
            {(Object.keys(SCOPE_DESCRIPTIONS) as BackupScope[]).map((s) => {
              const def = SCOPE_DESCRIPTIONS[s];
              const isSelected = scope === s;
              return (
                <Label
                  key={s}
                  htmlFor={`scope-${s}`}
                  className={`relative flex flex-col gap-2 rounded-lg border p-4 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="font-medium">{def.label}</div>
                    <RadioGroupItem value={s} id={`scope-${s}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{def.hint}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {def.tables.length} tabelle
                    </Badge>
                  </div>
                </Label>
              );
            })}
          </RadioGroup>

          <div className="text-xs text-muted-foreground">
            <span className="font-medium">Tabelle incluse:</span>{" "}
            {SCOPE_DESCRIPTIONS[scope].tables.join(", ")}
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              onClick={() => runBackup.mutate(scope)}
              disabled={runBackup.isPending || !currentBrand?.id}
              size="lg"
            >
              {runBackup.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generazione in corso…
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Genera e scarica backup
                </>
              )}
            </Button>
            <span className="text-xs text-muted-foreground">
              Formato: <code>.tar.gz</code> con JSONL per tabella + manifest.json
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico backup</CardTitle>
          <CardDescription>Ultimi 50 backup eseguiti per questo brand.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nessun backup eseguito.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Righe</TableHead>
                  <TableHead className="text-right">Dimensione</TableHead>
                  <TableHead className="text-right">Durata</TableHead>
                  <TableHead>Stato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {format(new Date(r.created_at), "d MMM yyyy HH:mm", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.scope}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {r.total_rows.toLocaleString("it-IT")}
                      {r.truncated_tables.length > 0 && (
                        <AlertTriangle
                          className="inline h-3 w-3 ml-1 text-amber-500"
                          aria-label={`Truncated: ${r.truncated_tables.join(", ")}`}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatBytes(r.size_bytes)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatDuration(r.duration_ms)}
                    </TableCell>
                    <TableCell>
                      {r.status === "completed" ? (
                        <Badge variant="secondary" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> ok
                        </Badge>
                      ) : r.status === "failed" ? (
                        <Badge variant="destructive" title={r.error ?? ""}>
                          fallito
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> in corso
                        </Badge>
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
