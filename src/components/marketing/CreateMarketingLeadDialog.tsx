import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { useBrand } from "@/contexts/BrandContext";
import { useMarketingCampaigns } from "@/hooks/useMarketingCampaigns";
import { useCreateMarketingLead } from "@/hooks/useMarketingLeads";
import { useContactSearch } from "@/hooks/useContactSearch";
import { toast } from "sonner";
import { Search, User } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateMarketingLeadDialog({ open, onOpenChange }: Props) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id || "";

  const { data: campaigns } = useMarketingCampaigns();
  const createLead = useCreateMarketingLead();

  const [searchQuery, setSearchQuery] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [contactLabel, setContactLabel] = useState("");
  const [campaignId, setCampaignId] = useState<string>("none");
  const [sourceName, setSourceName] = useState("Lead manuale marketing");
  const [notes, setNotes] = useState("");

  const { data: searchResults } = useContactSearch(searchQuery);

  const handleSubmit = async () => {
    if (!contactId) {
      toast.error("Seleziona un contatto");
      return;
    }

    try {
      await createLead.mutateAsync({
        brandId,
        contactId,
        campaignId: campaignId !== "none" ? campaignId : undefined,
        sourceName: sourceName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Lead manuale creato");
      resetForm();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Errore nella creazione del lead");
    }
  };

  const resetForm = () => {
    setSearchQuery("");
    setContactId(null);
    setContactLabel("");
    setCampaignId("none");
    setSourceName("Lead manuale marketing");
    setNotes("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nuovo Lead Manuale</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Contact Search */}
          <div className="space-y-2">
            <Label>Contatto *</Label>
            {contactId ? (
              <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium flex-1">{contactLabel}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setContactId(null);
                    setContactLabel("");
                    setSearchQuery("");
                  }}
                >
                  Cambia
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Cerca contatto per nome, telefono..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                {searchQuery.length >= 2 && searchResults && searchResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {searchResults.slice(0, 8).map((c: any) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
                        onClick={() => {
                          setContactId(c.id);
                          setContactLabel(
                            `${c.first_name || ""} ${c.last_name || ""}`.trim() || c.email || c.id
                          );
                          setSearchQuery("");
                        }}
                      >
                        <p className="font-medium">
                          {c.first_name || ""} {c.last_name || ""}
                        </p>
                        {c.email && (
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Campaign */}
          <div className="space-y-2">
            <Label>Campagna</Label>
            <Select value={campaignId} onValueChange={setCampaignId}>
              <SelectTrigger>
                <SelectValue placeholder="Nessuna campagna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Nessuna campagna</SelectItem>
                {campaigns?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source Name */}
          <div className="space-y-2">
            <Label>Fonte</Label>
            <Input
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder="Es: Telefonata, Evento, Passaparola"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Note</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note aggiuntive..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button onClick={handleSubmit} disabled={!contactId || createLead.isPending}>
            {createLead.isPending ? "Creazione..." : "Crea Lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
