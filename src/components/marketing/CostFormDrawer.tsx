import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMarketingCampaigns } from "@/hooks/useMarketingCampaigns";
import { useCreateMarketingCost, useUpdateMarketingCost } from "@/hooks/useMarketingCosts";
import { toast } from "sonner";
import type { MarketingCost } from "@/types/marketing";

interface CostFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cost?: MarketingCost | null;
}

export function CostFormDrawer({ open, onOpenChange, cost }: CostFormDrawerProps) {
  const isEdit = !!cost;
  const { data: campaigns } = useMarketingCampaigns({ status: "active" });
  const createCost = useCreateMarketingCost();
  const updateCost = useUpdateMarketingCost();

  const [form, setForm] = useState({
    campaign_id: null as string | null,
    amount: "",
    cost_date: new Date().toISOString().split("T")[0],
    source: "",
    notes: "",
  });

  useEffect(() => {
    if (cost) {
      setForm({
        campaign_id: cost.campaign_id,
        amount: cost.amount.toString(),
        cost_date: cost.cost_date,
        source: cost.source || "",
        notes: cost.notes || "",
      });
    } else {
      setForm({
        campaign_id: null,
        amount: "",
        cost_date: new Date().toISOString().split("T")[0],
        source: "",
        notes: "",
      });
    }
  }, [cost, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      campaign_id: form.campaign_id,
      amount: parseFloat(form.amount),
      cost_date: form.cost_date,
      source: form.source || null,
      notes: form.notes || null,
    };

    try {
      if (isEdit && cost) {
        await updateCost.mutateAsync({ id: cost.id, ...payload });
        toast.success("Costo aggiornato");
      } else {
        await createCost.mutateAsync(payload);
        toast.success("Costo registrato");
      }
      onOpenChange(false);
    } catch (error) {
      toast.error("Errore nel salvataggio");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Modifica Costo" : "Nuovo Costo Marketing"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Modifica i dettagli del costo" : "Registra un nuovo costo marketing"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>Campagna</Label>
            <Select
              value={form.campaign_id || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, campaign_id: v === "__none__" ? null : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona campagna (opzionale)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nessuna campagna</SelectItem>
                {campaigns?.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Importo (€) *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cost_date">Data *</Label>
            <Input
              id="cost_date"
              type="date"
              value={form.cost_date}
              onChange={(e) => setForm((f) => ({ ...f, cost_date: e.target.value }))}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Fonte</Label>
            <Select
              value={form.source || undefined}
              onValueChange={(v) => setForm((f) => ({ ...f, source: v === "__none__" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleziona fonte" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Non specificata</SelectItem>
                <SelectItem value="manual">Inserimento manuale</SelectItem>
                <SelectItem value="meta_api">Meta API</SelectItem>
                <SelectItem value="google_api">Google Ads API</SelectItem>
                <SelectItem value="import">Import CSV</SelectItem>
                <SelectItem value="fattura">Fattura</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Note</Label>
            <Textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Dettagli aggiuntivi..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={createCost.isPending || updateCost.isPending}>
              {isEdit ? "Salva" : "Registra"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
