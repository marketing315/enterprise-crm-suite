import { useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { SetupStepCard } from "../SetupStepCard";
import { useMarkSetupStep } from "@/hooks/useAdminSetupProgress";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export function Step4TicketSla({ completed, stepNumber }: { completed: boolean; stepNumber: number }) {
  const { currentBrand } = useBrand();
  const markStep = useMarkSetupStep();
  const [l1, setL1] = useState(30);
  const [l2, setL2] = useState(120);
  const [l3, setL3] = useState(480);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!currentBrand) return toast.error("Seleziona prima un brand");
    if (l1 < 1 || l2 <= l1 || l3 <= l2) {
      return toast.error("Le soglie devono essere crescenti (L1 < L2 < L3)");
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("ticket_escalation_policies").insert({
        brand_id: currentBrand.id,
        is_default: false,
        level_1_minutes: l1,
        level_2_minutes: l2,
        level_3_minutes: l3,
        level_1_roles: ["responsabile_callcenter"],
        level_2_roles: ["responsabile_callcenter", "admin"],
        level_3_roles: ["admin", "ceo"],
        notes: "Configurato dal wizard di setup",
      });
      if (error) throw error;
      toast.success("Policy SLA salvata");
      markStep.mutate("ticket_sla_configured");
    } catch (e) {
      toast.error(`Errore: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SetupStepCard
      step={stepNumber}
      icon={Clock}
      title="Configura SLA ticket"
      description="Imposta dopo quanti minuti dal breach un ticket non gestito viene escalato ai livelli successivi (L1 → L2 → L3)."
      completed={completed}
    >
      {!completed && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="sla-l1" className="text-xs">L1 (min)</Label>
              <Input id="sla-l1" type="number" min={1} value={l1} onChange={(e) => setL1(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sla-l2" className="text-xs">L2 (min)</Label>
              <Input id="sla-l2" type="number" min={1} value={l2} onChange={(e) => setL2(Number(e.target.value))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sla-l3" className="text-xs">L3 (min)</Label>
              <Input id="sla-l3" type="number" min={1} value={l3} onChange={(e) => setL3(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Default consigliati: 30 / 120 / 480</p>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Salvataggio..." : "Salva policy"}</Button>
          </div>
        </div>
      )}
    </SetupStepCard>
  );
}
