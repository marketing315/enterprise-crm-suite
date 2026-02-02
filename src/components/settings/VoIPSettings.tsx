import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, AlertCircle, Save, Key } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface VoIPConfig {
  provider: string;
  enabled: boolean;
  outbound_number: string;
  notes: string;
}

const VOIP_PROVIDERS = [
  { value: "twilio", label: "Twilio" },
  { value: "aircall", label: "Aircall" },
  { value: "ringover", label: "Ringover" },
  { value: "cloudtalk", label: "CloudTalk" },
  { value: "sip", label: "SIP / Asterisk" },
  { value: "other", label: "Altro" },
  { value: "not_configured", label: "Non ancora scelto" },
];

export function VoIPSettings() {
  const { currentBrand } = useBrand();
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  
  const isAdmin = currentBrand ? hasRole("admin", currentBrand.id) : false;

  // Load VoIP config from brand settings (using admin_notes as simple key-value store)
  const { data: config, isLoading } = useQuery({
    queryKey: ["voip-config", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return null;
      
      const { data, error } = await supabase
        .from("admin_notes")
        .select("content")
        .eq("brand_id", currentBrand.id)
        .eq("type", "voip_config")
        .maybeSingle();
      
      if (error && error.code !== "PGRST116") throw error;
      
      if (data?.content) {
        try {
          return JSON.parse(data.content) as VoIPConfig;
        } catch {
          return null;
        }
      }
      return null;
    },
    enabled: !!currentBrand?.id,
  });

  const [formData, setFormData] = useState<VoIPConfig>({
    provider: "not_configured",
    enabled: false,
    outbound_number: "",
    notes: "",
  });

  useEffect(() => {
    if (config) {
      setFormData(config);
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: async (newConfig: VoIPConfig) => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user record
      const { data: userRecord } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", user.id)
        .single();
      
      if (!userRecord) throw new Error("User not found");

      // Check if config exists
      const { data: existing } = await supabase
        .from("admin_notes")
        .select("id")
        .eq("brand_id", currentBrand.id)
        .eq("type", "voip_config")
        .maybeSingle();

      const content = JSON.stringify(newConfig);

      if (existing) {
        const { error } = await supabase
          .from("admin_notes")
          .update({ content })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("admin_notes")
          .insert({
            brand_id: currentBrand.id,
            type: "voip_config",
            content,
            created_by: userRecord.id,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voip-config"] });
      toast.success("Configurazione VoIP salvata");
    },
    onError: (error) => {
      toast.error(error.message || "Errore durante il salvataggio");
    },
  });

  const handleSave = () => {
    saveConfig.mutate(formData);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="h-5 w-5" />
          Configurazione VoIP
        </CardTitle>
        <CardDescription>
          Configura il provider VoIP per le chiamate click-to-call
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="voip-enabled" className="text-base font-medium">
              VoIP Attivo
            </Label>
            <p className="text-sm text-muted-foreground">
              Abilita le funzionalità click-to-call
            </p>
          </div>
          <Switch
            id="voip-enabled"
            checked={formData.enabled}
            onCheckedChange={(enabled) => setFormData(prev => ({ ...prev, enabled }))}
            disabled={!isAdmin}
          />
        </div>

        {/* Provider selection */}
        <div className="space-y-2">
          <Label htmlFor="voip-provider">Provider VoIP</Label>
          <Select
            value={formData.provider}
            onValueChange={(provider) => setFormData(prev => ({ ...prev, provider }))}
            disabled={!isAdmin}
          >
            <SelectTrigger id="voip-provider">
              <SelectValue placeholder="Seleziona provider" />
            </SelectTrigger>
            <SelectContent>
              {VOIP_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Outbound number */}
        <div className="space-y-2">
          <Label htmlFor="voip-number">Numero in uscita</Label>
          <Input
            id="voip-number"
            placeholder="+39 02 1234567"
            value={formData.outbound_number}
            onChange={(e) => setFormData(prev => ({ ...prev, outbound_number: e.target.value }))}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">
            Il numero che apparirà come chiamante
          </p>
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="voip-notes">Note / API Key info</Label>
          <Input
            id="voip-notes"
            placeholder="Credenziali o note per la configurazione"
            value={formData.notes}
            onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
            disabled={!isAdmin}
          />
          <p className="text-xs text-muted-foreground">
            Per le API key sensibili, usa la sezione Secrets
          </p>
        </div>

        {/* API Key reminder */}
        {formData.provider && formData.provider !== "not_configured" && (
          <Alert>
            <Key className="h-4 w-4" />
            <AlertDescription>
              Se il provider richiede API key, ricordati di aggiungerle nei Secrets del progetto
              (es. VOIP_API_KEY, VOIP_API_SECRET).
            </AlertDescription>
          </Alert>
        )}

        {!isAdmin && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Solo gli amministratori possono modificare queste impostazioni.
            </AlertDescription>
          </Alert>
        )}

        {/* Save button */}
        {isAdmin && (
          <Button 
            onClick={handleSave} 
            disabled={saveConfig.isPending}
            className="w-full"
          >
            <Save className="h-4 w-4 mr-2" />
            {saveConfig.isPending ? "Salvataggio..." : "Salva configurazione"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
