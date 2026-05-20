import { useState } from "react";
import { 
  FileSpreadsheet, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Download,
  Calendar,
  Filter,
  Loader2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBrand } from "@/contexts/BrandContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

type ExportType = "full" | "sales" | "deals" | "kpi" | "leads";

export function GoogleSheetsSettings() {
  const { currentBrand } = useBrand();
  const queryClient = useQueryClient();
  
  const [exportType, setExportType] = useState<ExportType>("full");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [isExporting, setIsExporting] = useState(false);

  // Fetch recent export logs
  const { data: exportLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["sheets-export-logs", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return [];
      const { data, error } = await supabase
        .from("sheets_export_logs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data;
    },
    enabled: !!currentBrand?.id,
  });

  // Calculate stats
  const stats = {
    total: exportLogs?.length || 0,
    success: exportLogs?.filter((l) => l.status === "success").length || 0,
    failed: exportLogs?.filter((l) => l.status === "failed").length || 0,
    processing: exportLogs?.filter((l) => l.status === "processing").length || 0,
    totalRows: exportLogs?.reduce((acc, l) => acc + (l.rows_exported || 0), 0) || 0,
  };

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      // Calculate date range
      let dateFrom: string | undefined;
      const dateTo = format(new Date(), "yyyy-MM-dd");
      
      switch (dateRange) {
        case "7d":
          dateFrom = format(subDays(new Date(), 7), "yyyy-MM-dd");
          break;
        case "30d":
          dateFrom = format(subDays(new Date(), 30), "yyyy-MM-dd");
          break;
        case "90d":
          dateFrom = format(subDays(new Date(), 90), "yyyy-MM-dd");
          break;
        case "all":
          dateFrom = undefined;
          break;
      }

      const functionName = exportType === "leads" ? "sheets-leads-export" : "sheets-advanced-export";
      const bodyPayload = exportType === "leads"
        ? { date_from: dateFrom, date_to: dateTo }
        : { export_type: exportType, brand_id: currentBrand?.id, date_from: dateFrom, date_to: dateTo };

      const { data, error } = await supabase.functions.invoke(functionName, {
        body: bodyPayload,
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || "Export failed");
      
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Export completato: ${data.rows_exported} righe esportate`);
      queryClient.invalidateQueries({ queryKey: ["sheets-export-logs"] });
    },
    onError: (error) => {
      toast.error(`Errore export: ${error.message}`);
    },
  });

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportMutation.mutateAsync();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10">
                <FileSpreadsheet className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <CardTitle>Google Sheets Integration</CardTitle>
                <CardDescription>
                  Export avanzato verso Google Sheets con SALES, DEALS e KPI
                </CardDescription>
              </div>
            </div>
            <Badge variant="outline" className="gap-1">
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              Attivo
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              L'integrazione utilizza un Service Account globale. I dati vengono esportati in fogli separati (SALES, DEALS, KPI).
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Spreadsheet ID</Label>
              <div className="flex gap-2">
                <Input 
                  value="••••••••••••••••••••" 
                  disabled 
                  className="font-mono text-sm"
                />
                <Button variant="outline" size="icon" asChild aria-label="Apri link esterno">
                  <a 
                    href="https://docs.google.com/spreadsheets" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Service Account</Label>
              <Input 
                value="sheets-export@*.iam.gserviceaccount.com" 
                disabled 
                className="font-mono text-sm"
              />
            </div>
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Export automatico (lead events)</Label>
              <p className="text-sm text-muted-foreground">
                I nuovi lead vengono esportati automaticamente nel tab ALL_RAW
              </p>
            </div>
            <Switch checked disabled />
          </div>
        </CardContent>
      </Card>

      {/* Manual Export Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Manuale Avanzato
          </CardTitle>
          <CardDescription>
            Esporta dati specifici con filtri personalizzati
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            {/* Export Type */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                Tipo Export
              </Label>
              <Select value={exportType} onValueChange={(v) => setExportType(v as ExportType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full">
                    <span className="flex items-center gap-2">
                      📦 Completo (SALES + DEALS + KPI)
                    </span>
                  </SelectItem>
                  <SelectItem value="sales">
                    <span className="flex items-center gap-2">
                      💰 Solo Vendite
                    </span>
                  </SelectItem>
                  <SelectItem value="deals">
                    <span className="flex items-center gap-2">
                      🎯 Solo Trattative
                    </span>
                  </SelectItem>
                  <SelectItem value="kpi">
                    <span className="flex items-center gap-2">
                      📊 Solo KPI (formule)
                    </span>
                  </SelectItem>
                  <SelectItem value="leads">
                    <span className="flex items-center gap-2">
                      📋 Tutti i Lead (tutti i brand)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                Periodo
              </Label>
              <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Ultimi 7 giorni</SelectItem>
                  <SelectItem value="30d">Ultimi 30 giorni</SelectItem>
                  <SelectItem value="90d">Ultimi 90 giorni</SelectItem>
                  <SelectItem value="all">Tutti i dati</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Export Button */}
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button 
                onClick={handleExport} 
                disabled={isExporting}
                className="w-full"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Esportazione...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Esporta Ora
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
            <p>
              <strong>Fogli generati:</strong>
            </p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside">
              <li><strong>SALES</strong> — Vendite con data, cliente, venditore, importo</li>
              <li><strong>DEALS</strong> — Trattative con stage, valore, stato</li>
              <li><strong>KPI</strong> — Formule per Win Rate, totali, medie (non sovrascrive)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statistiche Export</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-xs text-muted-foreground">Totali</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.success}</div>
              <div className="text-xs text-muted-foreground">Successo</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
              <div className="text-xs text-muted-foreground">Falliti</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-500">{stats.processing}</div>
              <div className="text-xs text-muted-foreground">In corso</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.totalRows.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground">Righe Tot.</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Exports */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Export Recenti</CardTitle>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => queryClient.invalidateQueries({ queryKey: ["sheets-export-logs"] })}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Aggiorna
          </Button>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">Caricamento...</div>
          ) : exportLogs && exportLogs.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {exportLogs.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {log.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : log.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive shrink-0" />
                    ) : (
                      <RefreshCw className="h-4 w-4 text-amber-500 animate-spin shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {log.tab_name || "FULL"}
                        {log.rows_exported > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {log.rows_exported} righe
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm:ss", { locale: it })}
                      </div>
                    </div>
                  </div>
                  {log.error && (
                    <Badge variant="destructive" className="text-xs max-w-[150px] truncate">
                      {log.error}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Nessun export recente
            </div>
          )}
        </CardContent>
      </Card>

      {/* Documentation Link */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Documentazione</h4>
              <p className="text-sm text-muted-foreground">
                Consulta la guida completa per l'integrazione Google Sheets
              </p>
            </div>
            <Button variant="outline" asChild>
              <a href="/docs/google-sheets.md" target="_blank">
                <ExternalLink className="mr-2 h-4 w-4" />
                Apri Docs
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
