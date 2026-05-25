import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, AlertCircle, Save, Info, ExternalLink } from "lucide-react";
import { useBrand } from "@/contexts/BrandContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface VOIspeedConfig {
  id?: string;
  base_url: string;
  token: string;
  domain: string;
  enabled: boolean;
  enable_realtime_poll?: boolean;
  poll_agents_service?: string;
  poll_queues_service?: string;
  poll_ivr_service?: string;
  last_poll_at?: string | null;
  last_poll_error?: string | null;
  last_ivr_sync_at?: string | null;
  last_ivr_sync_error?: string | null;
}

export function VOIspeedSettings() {
  const { currentBrand } = useBrand();
  const { hasRole, isAdmin, isCeo } = useAuth();
  const queryClient = useQueryClient();
  
  const canManage = currentBrand ? (isAdmin || isCeo || hasRole("admin", currentBrand.id)) : false;

  // Load VOIspeed config
  const { data: config, isLoading } = useQuery({
    queryKey: ["voispeed-config-full", currentBrand?.id],
    queryFn: async () => {
      if (!currentBrand?.id) return null;
      
      const { data, error } = await supabase
        .from("voispeed_configs")
        .select("*")
        .eq("brand_id", currentBrand.id)
        .maybeSingle();
      
      if (error && error.code !== "PGRST116") throw error;
      return data as VOIspeedConfig | null;
    },
    enabled: !!currentBrand?.id && canManage,
  });

  const [formData, setFormData] = useState<VOIspeedConfig>({
    base_url: "",
    token: "",
    domain: "",
    enabled: false,
    enable_realtime_poll: false,
    poll_agents_service: "agents_status",
    poll_queues_service: "queues_stats",
    poll_ivr_service: "ivr_tree",
  });

  useEffect(() => {
    if (config) {
      setFormData({
        id: config.id,
        base_url: config.base_url || "",
        token: config.token || "",
        domain: config.domain || "",
        enabled: config.enabled,
        enable_realtime_poll: config.enable_realtime_poll ?? false,
        poll_agents_service: config.poll_agents_service || "agents_status",
        poll_queues_service: config.poll_queues_service || "queues_stats",
        poll_ivr_service: config.poll_ivr_service || "ivr_tree",
        last_poll_at: config.last_poll_at ?? null,
        last_poll_error: config.last_poll_error ?? null,
        last_ivr_sync_at: config.last_ivr_sync_at ?? null,
        last_ivr_sync_error: config.last_ivr_sync_error ?? null,
      });
    }
  }, [config]);

  const saveConfig = useMutation({
    mutationFn: async (newConfig: VOIspeedConfig) => {
      if (!currentBrand?.id) throw new Error("No brand selected");
      
      if (config?.id) {
        // Update existing
        const { error } = await supabase
          .from("voispeed_configs")
          .update({
            base_url: newConfig.base_url,
            token: newConfig.token,
            domain: newConfig.domain || null,
            enabled: newConfig.enabled,
            enable_realtime_poll: !!newConfig.enable_realtime_poll,
            poll_agents_service: newConfig.poll_agents_service || "agents_status",
            poll_queues_service: newConfig.poll_queues_service || "queues_stats",
          })
          .eq("id", config.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from("voispeed_configs")
          .insert({
            brand_id: currentBrand.id,
            base_url: newConfig.base_url,
            token: newConfig.token,
            domain: newConfig.domain || null,
            enabled: newConfig.enabled,
            enable_realtime_poll: !!newConfig.enable_realtime_poll,
            poll_agents_service: newConfig.poll_agents_service || "agents_status",
            poll_queues_service: newConfig.poll_queues_service || "queues_stats",
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["voispeed-config"] });
      queryClient.invalidateQueries({ queryKey: ["voispeed-config-full"] });
      toast.success("Configurazione VOIspeed salvata");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Errore durante il salvataggio");
    },
  });

  const handleSave = () => {
    if (!formData.base_url) {
      toast.error("URL SERI obbligatorio");
      return;
    }
    if (!formData.token) {
      toast.error("Token obbligatorio");
      return;
    }
    saveConfig.mutate(formData);
  };

  if (!canManage) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            VOIspeed v4
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Solo gli amministratori possono configurare VOIspeed.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

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
          VOIspeed v4 - Integrazione Click-to-Call
        </CardTitle>
        <CardDescription>
          Configura l'integrazione con VOIspeed per chiamate reali dal CRM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="voispeed-enabled" className="text-base font-medium">
              Integrazione Attiva
            </Label>
            <p className="text-sm text-muted-foreground">
              Abilita le chiamate VOIspeed per questo brand
            </p>
          </div>
          <Switch
            id="voispeed-enabled"
            checked={formData.enabled}
            onCheckedChange={(enabled) => setFormData(prev => ({ ...prev, enabled }))}
          />
        </div>

        {/* SERI URL */}
        <div className="space-y-2">
          <Label htmlFor="voispeed-url">URL Endpoint SERI *</Label>
          <Input
            id="voispeed-url"
            placeholder="https://voispeed.example.com/PBX/seri.php"
            value={formData.base_url}
            onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            L'endpoint SERI di VOIspeed (es. https://server/PBX/seri.php)
          </p>
        </div>

        {/* Token */}
        <div className="space-y-2">
          <Label htmlFor="voispeed-token">Token Integrazione *</Label>
          <Input
            id="voispeed-token"
            type="password"
            placeholder="••••••••"
            value={formData.token}
            onChange={(e) => setFormData(prev => ({ ...prev, token: e.target.value }))}
          />
          <p className="text-xs text-muted-foreground">
            Il token del modulo integrazione SERI
          </p>
        </div>

        {/* Domain (optional) */}
        <div className="space-y-2">
          <Label htmlFor="voispeed-domain">Dominio / License ID (opzionale)</Label>
          <Input
            id="voispeed-domain"
            placeholder="example.voispeed.it"
            value={formData.domain}
            onChange={(e) => setFormData(prev => ({ ...prev, domain: e.target.value }))}
          />
        </div>

        {/* Info box */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="space-y-2">
            <p><strong>Configurazione utenti:</strong></p>
            <p>Ogni operatore deve avere il proprio interno VOIspeed configurato nel profilo (campo <code>voispeed_ext</code>).</p>
            <p><strong>Webhook eventi:</strong></p>
            <p>Configura VOIspeed per inviare eventi a:</p>
            <code className="block bg-muted px-2 py-1 rounded text-xs">
              {`${import.meta.env.VITE_SUPABASE_URL || 'https://[project].supabase.co'}/functions/v1/voispeed-events-webhook`}
            </code>
          </AlertDescription>
        </Alert>

        {/* Wallboard live polling (F6) */}
        <div className="rounded-lg border border-border bg-card/50 p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="voispeed-realtime" className="text-base font-medium">
                Wallboard live (polling SERI ogni 60s)
              </Label>
              <p className="text-sm text-muted-foreground">
                Aggiorna in tempo reale stato operatori e statistiche code sul wallboard.
                Richiede che i service <code>agents_status</code> e <code>queues_stats</code> siano abilitati lato VOIspeed.
              </p>
            </div>
            <Switch
              id="voispeed-realtime"
              checked={!!formData.enable_realtime_poll}
              onCheckedChange={(v) => setFormData((p) => ({ ...p, enable_realtime_poll: v }))}
            />
          </div>

          {formData.enable_realtime_poll && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div className="space-y-1">
                <Label htmlFor="poll-agents">Service operatori</Label>
                <Input
                  id="poll-agents"
                  value={formData.poll_agents_service ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, poll_agents_service: e.target.value }))}
                  placeholder="agents_status"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="poll-queues">Service code</Label>
                <Input
                  id="poll-queues"
                  value={formData.poll_queues_service ?? ""}
                  onChange={(e) => setFormData((p) => ({ ...p, poll_queues_service: e.target.value }))}
                  placeholder="queues_stats"
                />
              </div>
            </div>
          )}

          {formData.last_poll_at && (
            <p className="text-xs text-muted-foreground">
              Ultimo polling: {new Date(formData.last_poll_at).toLocaleString("it-IT")}
              {formData.last_poll_error ? (
                <span className="text-destructive"> — errore: {formData.last_poll_error}</span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400"> — OK</span>
              )}
            </p>
          )}
        </div>


        {/* Documentation link */}
        <Button variant="outline" size="sm" asChild>
          <a href="https://voispeed.com/documentazione" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-2" />
            Documentazione VOIspeed
          </a>
        </Button>

        {/* Save button */}
        <Button 
          onClick={handleSave} 
          disabled={saveConfig.isPending}
          className="w-full"
        >
          <Save className="h-4 w-4 mr-2" />
          {saveConfig.isPending ? "Salvataggio..." : "Salva configurazione"}
        </Button>
      </CardContent>
    </Card>
  );
}
