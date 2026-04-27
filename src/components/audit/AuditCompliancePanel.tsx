import { useMemo, useState } from "react";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";
import { it } from "date-fns/locale";
import {
  FileCheck,
  Download,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Eye,
  FileX,
  KeyRound,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  useComplianceReports,
  useGenerateComplianceReport,
  useDeleteComplianceReport,
  useComplianceReportDetail,
  type ComplianceReportType,
} from "@/hooks/useComplianceReports";

const REPORT_TYPE_LABELS: Record<ComplianceReportType, { label: string; description: string }> = {
  gdpr: {
    label: "GDPR",
    description: "Tracciabilità accessi dati personali, esportazioni, cancellazioni",
  },
  sox: {
    label: "SOX",
    description: "Controlli interni, modifiche permessi, integrità dati finanziari",
  },
  custom: {
    label: "Custom",
    description: "Report personalizzato per un periodo specifico",
  },
};

function formatPeriod(start: string, end: string): string {
  return `${format(new Date(start), "dd MMM yyyy", { locale: it })} → ${format(new Date(end), "dd MMM yyyy", { locale: it })}`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditCompliancePanel() {
  const [filterType, setFilterType] = useState<ComplianceReportType | "all">("all");
  const [genOpen, setGenOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useComplianceReports(
    filterType === "all" ? undefined : filterType,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Report di Compliance
            </CardTitle>
            <CardDescription className="mt-1">
              Genera e archivia report aggregati GDPR / SOX per audit esterni. Ogni report
              include un checksum SHA-256 per la verifica di integrità.
            </CardDescription>
          </div>
          <Dialog open={genOpen} onOpenChange={setGenOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <FileCheck className="h-4 w-4" />
                Nuovo report
              </Button>
            </DialogTrigger>
            <GenerateReportDialog onClose={() => setGenOpen(false)} />
          </Dialog>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-4">
            <Label className="text-xs text-muted-foreground">Filtra per tipo:</Label>
            <Select value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="gdpr">GDPR</SelectItem>
                <SelectItem value="sox">SOX</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : reports.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nessun report generato. Clicca "Nuovo report" per iniziare.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Eventi</TableHead>
                    <TableHead>Generato</TableHead>
                    <TableHead>Checksum</TableHead>
                    <TableHead className="text-right">Azioni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Badge variant="outline" className="uppercase">
                          {r.report_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatPeriod(r.period_start, r.period_end)}
                      </TableCell>
                      <TableCell>{r.total_events ?? 0}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(r.generated_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </TableCell>
                      <TableCell>
                        <code className="text-[10px] font-mono text-muted-foreground">
                          {r.checksum.slice(0, 12)}…
                        </code>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDetailId(r.id)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <DeleteReportButton id={r.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ReportDetailDialog reportId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}

function GenerateReportDialog({ onClose }: { onClose: () => void }) {
  const today = new Date();
  const [reportType, setReportType] = useState<ComplianceReportType>("gdpr");
  const [periodStart, setPeriodStart] = useState(
    format(startOfMonth(subDays(today, 30)), "yyyy-MM-dd"),
  );
  const [periodEnd, setPeriodEnd] = useState(
    format(endOfMonth(subDays(today, 30)), "yyyy-MM-dd"),
  );
  const [notes, setNotes] = useState("");

  const generate = useGenerateComplianceReport();

  const handleSubmit = async () => {
    await generate.mutateAsync({
      reportType,
      periodStart: new Date(periodStart).toISOString(),
      periodEnd: new Date(periodEnd + "T23:59:59").toISOString(),
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Genera report di compliance</DialogTitle>
        <DialogDescription>
          {REPORT_TYPE_LABELS[reportType].description}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo report</Label>
          <Select value={reportType} onValueChange={(v) => setReportType(v as ComplianceReportType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gdpr">GDPR — Privacy & dati personali</SelectItem>
              <SelectItem value="sox">SOX — Controlli interni & permessi</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Inizio periodo</Label>
            <Input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Fine periodo</Label>
            <Input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Note (opzionale)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Es: Audit trimestrale Q1 2026"
            rows={2}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={generate.isPending}>
          Annulla
        </Button>
        <Button onClick={handleSubmit} disabled={generate.isPending}>
          {generate.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              Generazione…
            </>
          ) : (
            "Genera"
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DeleteReportButton({ id }: { id: string }) {
  const del = useDeleteComplianceReport();
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare il report?</AlertDialogTitle>
          <AlertDialogDescription>
            Il report verrà rimosso permanentemente. Questa azione non può essere annullata.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={() => del.mutate(id)}>Elimina</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReportDetailDialog({
  reportId,
  onClose,
}: {
  reportId: string | null;
  onClose: () => void;
}) {
  const { data: report, isLoading } = useComplianceReportDetail(reportId);

  const criticalCards = useMemo(() => {
    if (!report) return [];
    const c = report.summary.critical;
    return [
      { label: "Esportazioni", value: c.exports, icon: Download },
      { label: "Eliminazioni", value: c.deletions, icon: FileX },
      { label: "Modifiche permessi", value: c.permission_changes, icon: KeyRound },
      { label: "Accessi PII", value: c.pii_access, icon: Eye },
      { label: "Anomalie", value: c.anomalies, icon: AlertTriangle },
    ];
  }, [report]);

  return (
    <Dialog open={!!reportId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Dettaglio report
            {report && (
              <Badge variant="outline" className="uppercase ml-2">
                {report.report_type}
              </Badge>
            )}
          </DialogTitle>
          {report && (
            <DialogDescription>
              Periodo: {formatPeriod(report.period_start, report.period_end)}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading || !report ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Summary */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">Eventi totali</h3>
                <span className="text-2xl font-semibold tabular-nums">
                  {report.summary.total_events}
                </span>
              </div>
            </div>

            {/* Critical metrics */}
            <div>
              <h3 className="text-sm font-medium mb-2">Metriche critiche</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {criticalCards.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="rounded-md border bg-muted/20 p-3 flex flex-col gap-1"
                  >
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-lg font-semibold tabular-nums">{value}</span>
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* By action */}
            <div>
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" />
                Top azioni
              </h3>
              <div className="rounded-md border max-h-48 overflow-y-auto">
                <Table>
                  <TableBody>
                    {Object.entries(report.summary.by_action)
                      .sort(([, a], [, b]) => Number(b) - Number(a))
                      .slice(0, 10)
                      .map(([action, count]) => (
                        <TableRow key={action}>
                          <TableCell className="text-xs font-mono">{action}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums w-20">
                            {count}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* By entity */}
            <div>
              <h3 className="text-sm font-medium mb-2">Per tipo entità</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(report.summary.by_entity_type)
                  .sort(([, a], [, b]) => Number(b) - Number(a))
                  .map(([entity, count]) => (
                    <Badge key={entity} variant="secondary" className="font-mono text-[10px]">
                      {entity}: {count}
                    </Badge>
                  ))}
              </div>
            </div>

            {/* Checksum */}
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-xs text-muted-foreground mb-1">Checksum integrità SHA-256</div>
              <code className="text-[10px] font-mono break-all">{report.checksum}</code>
            </div>

            {report.notes && (
              <div>
                <h3 className="text-sm font-medium mb-1">Note</h3>
                <p className="text-xs text-muted-foreground">{report.notes}</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {report && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadJson(
                  `compliance-${report.report_type}-${format(new Date(report.period_end), "yyyy-MM-dd")}.json`,
                  report,
                )
              }
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Esporta JSON
            </Button>
          )}
          <Button onClick={onClose}>Chiudi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
