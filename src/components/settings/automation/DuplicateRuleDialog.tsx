import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useBrandHierarchy } from "@/hooks/useBrandHierarchy";
import { toast } from "sonner";

interface AutomationRule {
  id: string;
  name: string;
  brand_id: string;
  description: string | null;
  trigger_type: string;
  trigger_event_type: string | null;
  trigger_source: string | null;
  trigger_config: Record<string, unknown>;
  conditions: Record<string, unknown>;
  actions: unknown[];
  action_type: string;
  action_config: Record<string, unknown>;
  priority: number;
  requires_confirmation: boolean;
  stop_on_failure: boolean;
}

interface DuplicateRuleDialogProps {
  rule: AutomationRule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DuplicateRuleDialog({ rule, open, onOpenChange }: DuplicateRuleDialogProps) {
  const { data: brands } = useBrandHierarchy();
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState("");
  const [targetBrandId, setTargetBrandId] = useState("");

  // Reset form when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open && rule) {
      setNewName(`${rule.name} (copia)`);
      setTargetBrandId(rule.brand_id);
    }
    onOpenChange(open);
  };

  const duplicateMutation = useMutation({
    mutationFn: async () => {
      if (!rule) throw new Error("Nessuna regola selezionata");

      const newRule = {
        name: newName,
        brand_id: targetBrandId,
        description: rule.description,
        trigger_type: rule.trigger_type,
        trigger_event_type: rule.trigger_event_type,
        trigger_source: rule.trigger_source,
        trigger_config: rule.trigger_config,
        conditions: rule.conditions,
        actions: rule.actions as unknown[],
        action_type: rule.action_type,
        action_config: rule.action_config,
        priority: rule.priority,
        requires_confirmation: rule.requires_confirmation,
        stop_on_failure: rule.stop_on_failure,
        is_active: false, // Start inactive for safety
      };

      const { data, error } = await supabase
        .from("automation_rules")
        .insert(newRule as unknown as Record<string, unknown>)
        .select("id")
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
      toast.success("Regola duplicata con successo");
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Errore: ${error.message}`);
    },
  });

  const availableBrands = brands?.filter((b) => !b.is_system) || [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplica Automazione</DialogTitle>
          <DialogDescription>
            Crea una copia di questa regola in un altro brand. La nuova regola sarà disattivata di default.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome nuova regola</Label>
            <Input
              id="name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nome della regola"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="brand">Brand di destinazione</Label>
            <Select value={targetBrandId} onValueChange={setTargetBrandId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona brand" />
              </SelectTrigger>
              <SelectContent>
                {availableBrands.map((brand) => (
                  <SelectItem key={brand.id} value={brand.id}>
                    {brand.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            onClick={() => duplicateMutation.mutate()}
            disabled={!newName || !targetBrandId || duplicateMutation.isPending}
          >
            {duplicateMutation.isPending ? "Duplicando..." : "Duplica"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
