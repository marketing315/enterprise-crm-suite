import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Megaphone, X, Pencil, Sparkles, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useBrandCampaigns,
  useSetLeadEventCampaign,
  type BrandCampaignOption,
} from "@/hooks/useLeadEventCampaign";
import { useHasMarketingAccess } from "@/hooks/useMarketingAccess";

export interface CampaignMatchHints {
  /** lead_event.source — used as channel hint (meta, google, organic...) */
  source?: string | null;
  /** External provider id (es. meta_campaign_id) for exact match on campaign.external_id */
  externalCampaignId?: string | null;
  /** Campaign name from payload (meta_campaign_name) */
  campaignName?: string | null;
  /** UTM campaign string */
  utmCampaign?: string | null;
}

interface Props {
  eventId: string;
  currentCampaignId: string | null;
  currentCampaignName?: string | null;
  compact?: boolean;
  hints?: CampaignMatchHints;
}

const STATUS_OPEN = new Set(["active", "planned"]);

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function suggestCampaign(
  campaigns: BrandCampaignOption[],
  hints?: CampaignMatchHints,
): { campaign: BrandCampaignOption; reason: string } | null {
  if (!hints || campaigns.length === 0) return null;
  const ext = norm(hints.externalCampaignId);
  if (ext) {
    const m = campaigns.find((c) => norm(c.external_id) === ext);
    if (m) return { campaign: m, reason: "ID esterno corrispondente" };
  }
  const name = norm(hints.campaignName);
  if (name) {
    const exact = campaigns.find((c) => norm(c.name) === name);
    if (exact) return { campaign: exact, reason: "Nome campagna identico" };
    const partial = campaigns.find(
      (c) => norm(c.name).includes(name) || name.includes(norm(c.name)),
    );
    if (partial) return { campaign: partial, reason: "Nome campagna simile" };
  }
  const utm = norm(hints.utmCampaign);
  if (utm) {
    const exact = campaigns.find((c) => norm(c.name) === utm);
    if (exact) return { campaign: exact, reason: "UTM campaign identico" };
    const partial = campaigns.find(
      (c) => norm(c.name).includes(utm) || utm.includes(norm(c.name)),
    );
    if (partial) return { campaign: partial, reason: "UTM campaign simile" };
  }
  return null;
}

function formatDateRange(c: BrandCampaignOption): string {
  const start = new Date(c.start_date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  if (!c.end_date) return `dal ${start}`;
  const end = new Date(c.end_date).toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
  return `${start} → ${end}`;
}

/**
 * Inline selector per attribuire un lead_event a una campagna marketing.
 * Include: filtro stato (nasconde closed/paused), auto-suggerimento, raggruppamento
 * per canale, contesto per riga (date / budget / # lead).
 */
export function LeadEventCampaignSelector({
  eventId,
  currentCampaignId,
  currentCampaignName,
  compact,
  hints,
}: Props) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const hasAccess = useHasMarketingAccess();
  const { data: campaigns = [], isLoading } = useBrandCampaigns();
  const mutation = useSetLeadEventCampaign();

  const selected = campaigns.find((c) => c.id === currentCampaignId);
  const label = selected?.name ?? currentCampaignName ?? null;

  const suggestion = useMemo(
    () => suggestCampaign(campaigns, hints),
    [campaigns, hints],
  );

  const grouped = useMemo(() => {
    const filtered = showAll
      ? campaigns
      : campaigns.filter((c) => STATUS_OPEN.has(c.status));
    const map = new Map<string, BrandCampaignOption[]>();
    for (const c of filtered) {
      const key = c.channel_name ?? "Senza canale";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "it"));
  }, [campaigns, showAll]);

  const hiddenCount = campaigns.length - campaigns.filter((c) => STATUS_OPEN.has(c.status)).length;

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

      {/* Suggestion chip (only when no current attribution and there is a hint match) */}
      {!currentCampaignId && suggestion && (
        <Button
          variant="outline"
          size="sm"
          className="h-6 gap-1 text-xs border-primary/40 text-primary hover:bg-primary/10"
          onClick={() => handleSelect(suggestion.campaign.id)}
          disabled={mutation.isPending}
          title={suggestion.reason}
        >
          <Sparkles className="h-3 w-3" />
          Attribuisci: {suggestion.campaign.name}
        </Button>
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
        <PopoverContent className="w-[380px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Cerca campagna…" />
            <CommandList className="max-h-[360px]">
              <CommandEmpty>
                {isLoading ? "Caricamento…" : "Nessuna campagna trovata"}
              </CommandEmpty>

              {/* Suggestion */}
              {suggestion && (
                <>
                  <CommandGroup heading="Suggerita">
                    <CommandItem
                      value={`__suggest__ ${suggestion.campaign.name}`}
                      onSelect={() => handleSelect(suggestion.campaign.id)}
                      disabled={mutation.isPending}
                    >
                      <Sparkles className="mr-2 h-4 w-4 text-primary" />
                      <div className="flex flex-col flex-1 min-w-0">
                        <span className="font-medium truncate">
                          {suggestion.campaign.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {suggestion.reason}
                        </span>
                      </div>
                    </CommandItem>
                  </CommandGroup>
                  <CommandSeparator />
                </>
              )}

              {/* Clear */}
              {currentCampaignId && (
                <>
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
                  <CommandSeparator />
                </>
              )}

              {/* Grouped campaigns */}
              {grouped.map(([channelName, items]) => (
                <CommandGroup key={channelName} heading={channelName}>
                  {items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.external_id ?? ""} ${c.id}`}
                      onSelect={() => handleSelect(c.id)}
                      disabled={mutation.isPending}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 shrink-0",
                          currentCampaignId === c.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium truncate">{c.name}</span>
                          <Badge
                            variant={c.status === "active" ? "default" : "secondary"}
                            className="text-[10px] px-1 py-0 h-4"
                          >
                            {c.status}
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {formatDateRange(c)}
                          {c.planned_budget != null &&
                            ` · budget €${Number(c.planned_budget).toLocaleString("it-IT")}`}
                          {` · ${c.leads_count} lead`}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {/* Toggle archived */}
              {hiddenCount > 0 && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__toggle_archived__"
                      onSelect={() => setShowAll((v) => !v)}
                    >
                      {showAll ? (
                        <EyeOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Eye className="mr-2 h-4 w-4" />
                      )}
                      {showAll
                        ? "Nascondi campagne chiuse/in pausa"
                        : `Mostra anche chiuse/in pausa (${hiddenCount})`}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
