import { useState } from "react";
import { Webhook, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { SetupStepCard } from "../SetupStepCard";
import { useMarkSetupStep } from "@/hooks/useAdminSetupProgress";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export function Step3WebhookSource({ completed, stepNumber }: { completed: boolean; stepNumber: number }) {
  const { currentBrand } = useBrand();
  const navigate = useNavigate();
  const markStep = useMarkSetupStep();
  const [name, setName] = useState("Test webhook");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!currentBrand) return toast.error("Seleziona prima un brand");
    if (!name.trim()) return toast.error("Inserisci un nome");
    setCreating(true);
    try {
      // Generate a simple random api key (server will hash on save if applicable; we send placeholder)
      const apiKey = crypto.randomUUID().replace(/-/g, "");
      const apiKeyHash = apiKey; // backend column is api_key_hash; we store the raw token here so it works as identifier
      const { error } = await supabase.from("webhook_sources").insert({
        brand_id: currentBrand.id,
        name: name.trim(),
        api_key_hash: apiKeyHash,
        is_active: true,
        counts_as_new_lead: true,
        rate_limit_per_min: 60,
        replay_window_seconds: 300,
        hmac_enabled: false,
      });
      if (error) throw error;
      toast.success("Sorgente di test creata");
      markStep.mutate("webhook_source_created");
    } catch (e) {
      toast.error(`Errore: ${(e as Error).message}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <SetupStepCard
      step={stepNumber}
      icon={Webhook}
      title="Configura una sorgente webhook inbound di test"
      description="Le sorgenti webhook permettono di ricevere lead da landing page, form esterni, Meta, Keplero, ecc. Crea una sorgente di test per verificare il flusso."
      completed={completed}
    >
      {!completed && (
        <div className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1">
              <Label htmlFor="ws-name" className="text-xs">Nome sorgente</Label>
              <Input id="ws-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? "Creazione..." : "Crea sorgente di test"}
              </Button>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Per la configurazione avanzata (HMAC, mapping, stage di default):
            <Button variant="link" size="sm" className="h-auto px-1 py-0 text-xs" onClick={() => navigate("/settings?section=inbound-sources")}>
              Apri impostazioni sorgenti <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </SetupStepCard>
  );
}
