import { useState } from "react";
import { Check, ChevronsUpDown, Megaphone, X, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useBrandCampaigns, useSetLeadEventCampaign } from "@/hooks/useLeadEventCampaign";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";

interface Props {
  eventId: string;
  currentCampaignId: string | null;
  currentCampaignName?: string | null;
  compact?: boolean;
}

/**
 * Inline selector to attribute a lead_event to a marketing campaign.
 * Shows a small badge with the current campaign + edit button.
 */
export function LeadEventCampaignSelector({
  eventId,
  currentCampaignId,
  currentCampaignName,
  compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const hasAccess = useHasMarketingAccess();
  const { data: campaigns = [], isLoading } = useBrandCampaigns();
  const mutation = useSetLeadEventCampaign();

  const selected = campaigns.find((c) => c.id === currentCampaignId);
  const label = selected?.name ?? currentCampaignName ?? null;

  const handleSelect = (campaignId: string | null) => {
    mutation.mutate(
      { eventId, campaignId },
      { onSuccess: () => setOpen(false) },
    );
  };

  if (!hasAccess) {
    return label ? (
      <Badge variant="outline" className="gap-1">
        <Megaphone className="h-3 w-3" />
        {label}
      </Badge>
    ) : null;
  }

  return (
    <div className={cn("flex items-center gap-1.5 flex-wrap", compact && "text-xs")}>
      {label ? (
        <Badge variant="secondary" className="gap-1">
          <Megaphone className="h-3 w-3" />
          {label}
        </Badge>
      ) : (
        <Badge variant="outline" className="text-muted-foreground">
          Non attribuita
        </Badge>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            aria-label="Attribuisci campagna"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cerca campagna…" />
            <CommandList>
              <CommandEmpty>
                {isLoading ? "Caricamento…" : "Nessuna campagna trovata"}
              </CommandEmpty>
              {currentCampaignId && (
                <CommandGroup>
                  <CommandItem
                    value="__clear__"
                    onSelect={() => handleSelect(null)}
                    disabled={mutation.isPending}
                    className="text-destructive"
                  >
                    <X className="mr-2 h-4 w-4" />
                    Rimuovi attribuzione
                  </CommandItem>
                </CommandGroup>
              )}
              <CommandGroup heading="Campagne del brand">
                {campaigns.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.name} ${c.id}`}
                    onSelect={() => handleSelect(c.id)}
                    disabled={mutation.isPending}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        currentCampaignId === c.id ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.status} · dal {new Date(c.start_date).toLocaleDateString("it-IT")}
                      </span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
