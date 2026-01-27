import { useState } from "react";
import { FileSpreadsheet, ExternalLink, RefreshCw, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useBrand } from "@/contexts/BrandContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export function GoogleSheetsSettings() {
  const { currentBrand } = useBrand();
  const [isTestingConnection, setIsTestingConnection] = useState(false);

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
        .limit(10);
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
  };

  const handleTestConnection = async () => {
    setIsTestingConnection(true);
    // Simulate test - in production this would call an edge function
    await new Promise((resolve) => setTimeout(resolve, 1500));
    setIsTestingConnection(false);
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
                  Sincronizzazione automatica dei lead verso Google Sheets
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
              L'integrazione Google Sheets è configurata a livello di ambiente. 
              Contatta l'amministratore di sistema per modificare le credenziali.
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
                <Button variant="outline" size="icon" asChild>
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
              <Label>Export automatico</Label>
              <p className="text-sm text-muted-foreground">
                I nuovi lead vengono esportati automaticamente
              </p>
            </div>
            <Switch checked disabled />
          </div>
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statistiche Export (ultime 10)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
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
            onClick={handleTestConnection}
            disabled={isTestingConnection}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isTestingConnection ? "animate-spin" : ""}`} />
            Test Connessione
          </Button>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-sm text-muted-foreground">Caricamento...</div>
          ) : exportLogs && exportLogs.length > 0 ? (
            <div className="space-y-2">
              {exportLogs.map((log) => (
                <div 
                  key={log.id} 
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {log.status === "success" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : log.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />
                    )}
                    <div>
                      <div className="text-sm font-medium">
                        {log.tab_name || "ALL_RAW"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd MMM yyyy HH:mm", { locale: it })}
                      </div>
                    </div>
                  </div>
                  {log.error && (
                    <Badge variant="destructive" className="text-xs">
                      {log.error.slice(0, 30)}...
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
