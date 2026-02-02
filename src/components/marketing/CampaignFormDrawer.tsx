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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChannelSelect } from "./ChannelSelect";
import { useCreateMarketingCampaign, useUpdateMarketingCampaign } from "@/hooks/useMarketingCampaigns";
import { toast } from "sonner";
import type { MarketingCampaign, MarketingCampaignStatus } from "@/types/marketing";

interface CampaignFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign?: MarketingCampaign | null;
}

export function CampaignFormDrawer({ open, onOpenChange, campaign }: CampaignFormDrawerProps) {
  const isEdit = !!campaign;
  const createCampaign = useCreateMarketingCampaign();
  const updateCampaign = useUpdateMarketingCampaign();

  const [form, setForm] = useState({
    name: "",
    channel_id: null as string | null,
    external_id: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: "",
    planned_budget: "",
    status: "planned" as MarketingCampaignStatus,
  });

  useEffect(() => {
    if (campaign) {
      setForm({
        name: campaign.name,
        channel_id: campaign.channel_id,
        external_id: campaign.external_id || "",
        start_date: campaign.start_date,
        end_date: campaign.end_date || "",
        planned_budget: campaign.planned_budget?.toString() || "",
        status: campaign.status,
      });
    } else {
      setForm({
        name: "",
        channel_id: null,
        external_id: "",
        start_date: new Date().toISOString().split("T")[0],
        end_date: "",
        planned_budget: "",
        status: "planned",
      });
    }
  }, [campaign, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      name: form.name,
      channel_id: form.channel_id,
      external_id: form.external_id || null,
      start_date: form.start_date,
      end_date: form.end_date || null,
      planned_budget: form.planned_budget ? parseFloat(form.planned_budget) : null,
      status: form.status,
    };

    try {
      if (isEdit && campaign) {
        await updateCampaign.mutateAsync({ id: campaign.id, ...payload });
        toast.success("Campagna aggiornata");
      } else {
        await createCampaign.mutateAsync(payload);
        toast.success("Campagna creata");
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
          <SheetTitle>{isEdit ? "Modifica Campagna" : "Nuova Campagna"}</SheetTitle>
          <SheetDescription>
            {isEdit ? "Modifica i dettagli della campagna" : "Crea una nuova campagna marketing"}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nome campagna *</Label>
            <Input
              id="name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="es. Black Friday 2026"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Canale</Label>
            <ChannelSelect
              value={form.channel_id}
              onValueChange={(v) => setForm((f) => ({ ...f, channel_id: v }))}
              allowEmpty
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="external_id">ID Esterno (UTM/Campaign ID)</Label>
            <Input
              id="external_id"
              value={form.external_id}
              onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))}
              placeholder="es. fb_bf2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start_date">Data Inizio *</Label>
              <Input
                id="start_date"
                type="date"
                value={form.start_date}
                onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end_date">Data Fine</Label>
              <Input
                id="end_date"
                type="date"
                value={form.end_date}
                onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planned_budget">Budget Pianificato (€)</Label>
            <Input
              id="planned_budget"
              type="number"
              step="0.01"
              min="0"
              value={form.planned_budget}
              onChange={(e) => setForm((f) => ({ ...f, planned_budget: e.target.value }))}
              placeholder="0.00"
            />
          </div>

          <div className="space-y-2">
            <Label>Stato</Label>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as MarketingCampaignStatus }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="planned">Pianificata</SelectItem>
                <SelectItem value="active">Attiva</SelectItem>
                <SelectItem value="paused">In Pausa</SelectItem>
                <SelectItem value="closed">Chiusa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annulla
            </Button>
            <Button type="submit" disabled={createCampaign.isPending || updateCampaign.isPending}>
              {isEdit ? "Salva" : "Crea"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
