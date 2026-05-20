import { Check, ChevronsUpDown, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useState } from "react";
import { useMarketingCampaigns } from "@/hooks/useMarketingCampaigns";

interface CampaignSelectProps {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
}

export function CampaignSelect({ value, onChange, disabled }: CampaignSelectProps) {
  const [open, setOpen] = useState(false);
  const { data: campaigns, isLoading } = useMarketingCampaigns();

  const selectedCampaign = campaigns?.find((c) => c.id === value);

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading}
            className="w-full justify-between"
          >
            <div className="flex items-center gap-2 truncate">
              <Megaphone className="h-4 w-4 shrink-0 text-muted-foreground" />
              {selectedCampaign ? (
                <span className="truncate">{selectedCampaign.name}</span>
              ) : (
                <span className="text-muted-foreground">Seleziona campagna...</span>
              )}
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cerca campagna..." />
            <CommandList>
              <CommandEmpty>Nessuna campagna trovata.</CommandEmpty>
              <CommandGroup>
                {campaigns?.map((campaign) => (
                  <CommandItem
                    key={campaign.id}
                    value={campaign.name}
                    onSelect={() => {
                      onChange(campaign.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        value === campaign.id ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <div className="flex flex-col">
                      <span>{campaign.name}</span>
                      {campaign.marketing_channels && (
                        <span className="text-xs text-muted-foreground">
                          {campaign.marketing_channels.name}
                        </span>
                      )}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {value && !disabled && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onChange(null)}
          className="shrink-0"
         aria-label="Chiudi">
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
