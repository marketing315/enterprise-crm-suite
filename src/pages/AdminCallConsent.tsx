/**
 * GDPR — Pagina amministrazione: configurazione consenso registrazione chiamate
 * + log eventi (avvisi IVR, consensi DTMF, ritiri).
 * Route: /admin/call-consent
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, AlertCircle, Save, RefreshCw } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import {
  useBrandCallConsentConfig,
  useUpsertBrandCallConsentConfig,
  useCallConsentEvents,
  type RecordingLegalBasis,
} from "@/hooks/useBrandCallConsent";
import { toast } from "sonner";
import { format } from "date-fns";
import { it } from "date-fns/locale";

export default function AdminCallConsent() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id ?? null;

  const cfgQ = useBrandCallConsentConfig(brandId);
  const upsert = useUpsertBrandCallConsentConfig();
  const eventsQ = useCallConsentEvents(brandId, 200);

  const [legalBasis, setLegalBasis] = useState<RecordingLegalBasis>("legitimate_interest");
  const [audioUrl, setAudioUrl] = useState("");
  const [ivrRequired, setIvrRequired] = useState(false);
  const [policyVersion, setPolicyVersion] = useState("v1");
  const [dtmfGiven, setDtmfGiven] = useState("1");
  const [dtmfDenied, setDtmfDenied] = useState("2");
  const [ivrNodeId, setIvrNodeId] = useState("");

  useEffect(() => {
    if (cfgQ.data) {
      setLegalBasis(cfgQ.data.recording_legal_basis);
      setAudioUrl(cfgQ.data.ivr_announcement_audio_url ?? "");
      setIvrRequired(cfgQ.data.ivr_consent_required);
      setPolicyVersion(cfgQ.data.policy_version);
      setDtmfGiven(cfgQ.data.ivr_dtmf_consent_given ?? "1");
      setDtmfDenied(cfgQ.data.ivr_dtmf_consent_denied ?? "2");
      setIvrNodeId(cfgQ.data.ivr_consent_node_id ?? "");
    }
  }, [cfgQ.data]);

  if (!brandId) {
    return (
      <div className="container mx-auto py-6">
        <Alert><AlertCircle className="h-4 w-4" /><AlertDescription>Seleziona un brand specifico per configurare il consenso.</AlertDescription></Alert>
      </div>
    );
  }

  async function onSave() {
    try {
      await upsert.mutateAsync({
        brand_id: brandId!,
        recording_legal_basis: legalBasis,
        ivr_announcement_audio_url: audioUrl.trim() || null,
        ivr_consent_required: ivrRequired,
        policy_version: policyVersion.trim() || "v1",
        ivr_dtmf_consent_given: dtmfGiven.trim() || "1",
        ivr_dtmf_consent_denied: dtmfDenied.trim() || "2",
        ivr_consent_node_id: ivrNodeId.trim() || null,
      });
      toast.success("Configurazione consenso salvata");
    } catch (e) {
      toast.error("Errore: " + (e as Error).message);
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" /> Consenso registrazione chiamate
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Brand <strong>{currentBrand?.name}</strong> · GDPR art. 6 + 13 · ePrivacy
          </p>
        </div>
      </header>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Configurazione</TabsTrigger>
          <TabsTrigger value="events">Eventi consenso ({eventsQ.data?.length ?? 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Base giuridica & IVR</CardTitle>
              <CardDescription>
                La base giuridica determina come informare il chiamante e se serve raccogliere consenso esplicito (DTMF).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Base giuridica della registrazione</Label>
                <Select value={legalBasis} onValueChange={(v) => setLegalBasis(v as RecordingLegalBasis)}>
                  <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="legitimate_interest">Legittimo interesse (avviso informativo)</SelectItem>
                    <SelectItem value="consent">Consenso esplicito (DTMF richiesto)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {legalBasis === "consent"
                    ? "Il chiamante deve premere un tasto DTMF (es. 1 = acconsento, 2 = nego). Se nega, la registrazione viene disattivata."
                    : "Il chiamante riceve solo un avviso informativo; può comunque chiedere il ritiro in qualsiasi momento."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>URL audio avviso IVR</Label>
                <Input
                  placeholder="https://…/announce.wav"
                  value={audioUrl}
                  onChange={(e) => setAudioUrl(e.target.value)}
                  className="max-w-md"
                />
              </div>

              <div className="flex items-center justify-between max-w-md">
                <div>
                  <Label>Consenso DTMF obbligatorio</Label>
                  <p className="text-xs text-muted-foreground">Attiva se la base è "consenso esplicito"</p>
                </div>
                <Switch checked={ivrRequired} onCheckedChange={setIvrRequired} />
              </div>

              <div className="space-y-2 max-w-xs">
                <Label>Versione policy</Label>
                <Input value={policyVersion} onChange={(e) => setPolicyVersion(e.target.value)} />
              </div>

              <div className="flex items-center justify-between pt-2">
                <Badge variant="secondary">Ultimo salvataggio: {cfgQ.data ? format(new Date(cfgQ.data.updated_at), "Pp", { locale: it }) : "mai"}</Badge>
                <Button onClick={onSave} disabled={upsert.isPending} className="gap-2">
                  <Save className="h-4 w-4" /> {upsert.isPending ? "Salvataggio…" : "Salva configurazione"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Eventi recenti</CardTitle>
              <Button variant="outline" size="sm" onClick={() => eventsQ.refetch()} className="gap-2">
                <RefreshCw className="h-3 w-3" /> Aggiorna
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {eventsQ.isLoading ? (
                <div className="p-6 text-sm text-muted-foreground">Caricamento…</div>
              ) : (eventsQ.data?.length ?? 0) === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nessun evento registrato. L'IVR e gli operatori possono loggare via RPC <code>log_call_consent</code>.
                </div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Data</TableHead>
                        <TableHead>Azione</TableHead>
                        <TableHead>Sorgente</TableHead>
                        <TableHead>Base giuridica</TableHead>
                        <TableHead>DTMF</TableHead>
                        <TableHead>Policy</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {eventsQ.data!.map((ev) => (
                        <TableRow key={ev.id}>
                          <TableCell className="text-xs">{format(new Date(ev.recorded_at), "dd/MM HH:mm", { locale: it })}</TableCell>
                          <TableCell><Badge variant="outline">{ev.consent_action}</Badge></TableCell>
                          <TableCell className="text-xs">{ev.source}</TableCell>
                          <TableCell className="text-xs">{ev.legal_basis ?? "—"}</TableCell>
                          <TableCell className="text-xs tabular-nums">{ev.dtmf_input ?? "—"}</TableCell>
                          <TableCell className="text-xs">{ev.policy_version ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
