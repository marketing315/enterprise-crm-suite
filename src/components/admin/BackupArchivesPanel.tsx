import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CloudDownload, HardDrive, Loader2 } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import {
  useBackupArchives,
  useDownloadBackupArchive,
} from "@/hooks/useBackupSchedules";
import { format } from "date-fns";
import { it } from "date-fns/locale";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export function BackupArchivesPanel() {
  const { currentBrand } = useBrand();
  const { data: archives = [], isLoading } = useBackupArchives(currentBrand?.id);
  const download = useDownloadBackupArchive();

  return (
    <div className="space-y-6">
      <Alert>
        <HardDrive className="h-4 w-4" />
        <AlertTitle>Archivi su Storage privato</AlertTitle>
        <AlertDescription>
          Elenco dei backup caricati nel bucket cloud per questo brand. I link di download
          sono firmati e validi per 5 minuti. Gli archivi scaduti (oltre la retention) vengono rimossi automaticamente.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Archivi cloud</CardTitle>
          <CardDescription>
            Brand: <span className="font-medium text-foreground">{currentBrand?.name ?? "—"}</span>
            {" · "}
            <span className="text-xs">{archives.length} archivi disponibili</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">Caricamento…</div>
          ) : archives.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Nessun archivio su Storage. La pianificazione caricherà i prossimi backup automaticamente.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caricato</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Origine</TableHead>
                  <TableHead className="text-right">Righe</TableHead>
                  <TableHead className="text-right">Dimensione</TableHead>
                  <TableHead>Scade</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {archives.map((a) => (
                  <TableRow key={a.run_id}>
                    <TableCell className="text-sm">
                      {a.storage_uploaded_at
                        ? format(new Date(a.storage_uploaded_at), "d MMM yyyy HH:mm", { locale: it })
                        : "—"}
                    </TableCell>
                    <TableCell><Badge variant="outline">{a.scope}</Badge></TableCell>
                    <TableCell>
                      <Badge variant={a.scheduled ? "secondary" : "outline"} className="text-[10px]">
                        {a.scheduled ? "auto" : "manuale"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {a.total_rows.toLocaleString("it-IT")}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatBytes(a.size_bytes)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {a.expires_at
                        ? format(new Date(a.expires_at), "d MMM yyyy", { locale: it })
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => download.mutate(a.run_id)}
                        disabled={download.isPending}
                      >
                        {download.isPending && download.variables === a.run_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CloudDownload className="h-4 w-4" />
                        )}
                      </Button>
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
