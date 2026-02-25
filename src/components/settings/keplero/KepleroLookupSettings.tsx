import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Search, Copy, Key, RefreshCw, CheckCircle2, XCircle, AlertCircle,
  Phone, Globe, Shield,
} from "lucide-react";
import { toast } from "sonner";
import { useBrand } from "@/contexts/BrandContext";
import {
  useKepleroLookupSettings,
  useKepleroLookupSecrets,
  useToggleKepleroLookup,
  useGenerateKepleroSecret,
  useTestKepleroLookup,
} from "@/hooks/useKepleroLookupSettings";

export function KepleroLookupSettings() {
  const { currentBrand } = useBrand();
  const { data: settings, isLoading: settingsLoading } = useKepleroLookupSettings();
  const { data: secrets, isLoading: secretsLoading } = useKepleroLookupSecrets();
  const toggleMutation = useToggleKepleroLookup();
  const generateSecretMutation = useGenerateKepleroSecret();
  const testLookupMutation = useTestKepleroLookup();

  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testSecret, setTestSecret] = useState("");
  const [testResult, setTestResult] = useState<any>(null);
  const [lastBrandId, setLastBrandId] = useState<string | null | undefined>(undefined);

  const brandId = currentBrand?.id || null;
  const brandSlug = currentBrand?.name?.toLowerCase() || "";

  // Reset generated secret when brand changes
  useEffect(() => {
    if (lastBrandId !== undefined && lastBrandId !== brandId) {
      setGeneratedSecret(null);
      setTestResult(null);
    }
    setLastBrandId(brandId);
  }, [brandId, lastBrandId]);

  // Effective setting: brand-specific > global
  const brandSetting = settings?.find((s) => s.brand_id === brandId);
  const globalSetting = settings?.find((s) => s.brand_id === null);
  const effectiveSetting = brandSetting || globalSetting;
  const isEnabled = effectiveSetting?.is_enabled ?? false;

  const brandSecret = secrets?.find((s) => s.brand_id === brandId);
  const globalSecret = secrets?.find((s) => s.brand_id === null);
  const activeSecret = brandSecret || globalSecret;

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const endpointUrl = `https://${projectId}.supabase.co/functions/v1/keplero-contact-lookup`;

  const handleToggle = (enabled: boolean) => {
    toggleMutation.mutate({ enabled, brandId });
  };

  const handleGenerateSecret = async () => {
    const secret = await generateSecretMutation.mutateAsync({ brandId });
    setGeneratedSecret(secret);
    setTestSecret(secret);
  };

  const handleTest = async () => {
    if (!testPhone || !testSecret) {
      toast.error("Inserisci telefono e secret per il test");
      return;
    }
    // Sanitize pasted values (strip non-ASCII / invisible chars)
    const cleanPhone = testPhone.trim().replace(/[^\x20-\x7E]/g, "");
    const cleanSecret = testSecret.trim().replace(/[^\x20-\x7E]/g, "");
    if (!cleanSecret) {
      toast.error("Il secret contiene solo caratteri non validi — ricopialo");
      return;
    }
    setTestResult(null);
    try {
      const result = await testLookupMutation.mutateAsync({
        phone: cleanPhone,
        brandSlug,
        secret: cleanSecret,
      });
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ error: err.message });
    }
  };

  const copyKepleroConfig = () => {
    const config = `URL: ${endpointUrl}?phone={{waSessionNumber}}&brand_slug=${brandSlug}
Metodo: GET
Intestazioni:
  x-keplero-secret: <IL_TUO_SECRET>
Corpo: (vuoto)

Parametri query:
  phone → numero del chiamante (es. {{waSessionNumber}})
  brand_slug → ${brandSlug}

Risposta:
  found=true → contact.first_name, contact.last_name, contact.status, contact.tags
  found=false → numero non in CRM
  401 → secret errato/scaduto
  400 → parametri mancanti`;

    navigator.clipboard.writeText(config);
    toast.success("Configurazione copiata negli appunti");
  };

  if (settingsLoading || secretsLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Caricamento...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Enable/Disable */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Keplero Contact Lookup</CardTitle>
                <CardDescription className="text-xs">
                  Endpoint per cercare contatti dal numero di telefono
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={isEnabled ? "default" : "secondary"}>
                {isEnabled ? "Attivo" : "Disattivo"}
              </Badge>
              <Switch
                checked={isEnabled}
                onCheckedChange={handleToggle}
                disabled={toggleMutation.isPending}
              />
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Secret Management */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Secret di Autenticazione</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Il secret è obbligatorio per ogni chiamata all'endpoint
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {activeSecret ? (
            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium">Secret attivo</span>
                  <Badge variant="outline" className="text-xs">
                    {activeSecret.brand_id ? "Brand" : "Globale"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Creato il {new Date(activeSecret.created_at).toLocaleDateString("it-IT")}
                  {activeSecret.rotated_at &&
                    ` • Ruotato il ${new Date(activeSecret.rotated_at).toLocaleDateString("it-IT")}`}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateSecret}
                disabled={generateSecretMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5 mr-1" />
                Ruota
              </Button>
            </div>
          ) : (
            <Button onClick={handleGenerateSecret} disabled={generateSecretMutation.isPending}>
              <Key className="h-4 w-4 mr-2" />
              Genera Secret
            </Button>
          )}

          {generatedSecret && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="space-y-2">
                <p className="text-sm font-medium">
                  Copia questo secret — non sarà più visibile:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted px-2 py-1 text-xs font-mono break-all">
                    {generatedSecret}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedSecret);
                      toast.success("Secret copiato");
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Keplero Configuration Template */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Configurazione Keplero</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={copyKepleroConfig}>
              <Copy className="h-3.5 w-3.5 mr-1" />
              Copia tutto
            </Button>
          </div>
          <CardDescription className="text-xs">
            Incolla questi valori nella configurazione del trigger Keplero
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">URL</Label>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 rounded bg-background px-2 py-1 text-xs font-mono break-all border">
                  {endpointUrl}?phone={"{{waSessionNumber}}"}&brand_slug={brandSlug}
                </code>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${endpointUrl}?phone={{waSessionNumber}}&brand_slug=${brandSlug}`
                    );
                    toast.success("URL copiato");
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Metodo</Label>
                <p className="mt-1 text-xs font-mono">GET</p>
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground">Corpo</Label>
                <p className="mt-1 text-xs text-muted-foreground italic">(vuoto)</p>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Intestazioni</Label>
              <div className="mt-1 space-y-1">
                <code className="block rounded bg-background px-2 py-1 text-xs font-mono border">
                  x-keplero-secret: &lt;SECRET_GENERATO&gt;
                </code>
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Parametri query</Label>
              <div className="mt-1 space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <code className="font-mono">phone</code>
                  <span className="text-muted-foreground">→ numero del chiamante (es. {"{{waSessionNumber}}"})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <code className="font-mono">brand_slug</code>
                  <span className="text-muted-foreground">→ {brandSlug}</span>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <Label className="text-xs font-semibold text-muted-foreground">Gestione Risposta</Label>
              <div className="mt-1 space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  <span><code className="font-mono">found=true</code> → usa <code className="font-mono">contact.first_name</code>, <code className="font-mono">contact.last_name</code>, <code className="font-mono">contact.status</code>, <code className="font-mono">contact.tags</code></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="h-3 w-3 text-orange-500" />
                  <span><code className="font-mono">found=false</code> → numero non in CRM</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3 w-3 text-red-500" />
                  <span><code className="font-mono">401</code> → secret errato/scaduto</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Test Lookup</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Verifica il funzionamento dell'endpoint con un numero di test
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Numero di telefono</Label>
              <Input
                placeholder="3331234567"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">Secret</Label>
              <Input
                placeholder="Incolla il secret generato"
                value={testSecret}
                onChange={(e) => setTestSecret(e.target.value)}
                className="mt-1"
                type="password"
              />
            </div>
          </div>
          <Button
            onClick={handleTest}
            disabled={testLookupMutation.isPending || !isEnabled}
            size="sm"
          >
            <Search className="h-3.5 w-3.5 mr-1" />
            {testLookupMutation.isPending ? "Ricerca..." : "Testa Lookup"}
          </Button>

          {testResult && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border bg-muted/30 p-3 text-xs font-mono">
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
