/**
 * SourceFilterBar — Componente condiviso per i 3 moduli Dashboard Performance
 * (Canali & Costi, Call Center, Venditori).
 *
 * Spec: §3.1 (gerarchia fonte), §7 (filtri trasversali)
 * Decisioni: mem://features/dashboard-performance/decisions
 *
 * STATO F0 (questo file):
 *  - Zod schema condiviso `SourceFilterSchema` per `p_source_filter jsonb`
 *    (passato a tutte le RPC dei 3 moduli)
 *  - Tipi TS + helper `parseSourceFilter`
 *  - Componente stub minimale (selettori vuoti) — verrà cablato nei loop F1/F2/F4
 *    quando avremo i dati (tracking_numbers, marketing_campaign_groups esteso, ecc.)
 *
 * IMPORTANTE: in F0 il componente NON va ancora montato in pagine reali.
 * È pubblicato qui solo per fissare l'API condivisa (schema + type + props).
 */

import { z } from "zod";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter } from "lucide-react";
import { useActiveMarketingChannels } from "@/hooks/useMarketingChannels";
import { useMarketingCampaigns } from "@/hooks/useMarketingCampaigns";


// ---------------------------------------------------------------------------
// Schema condiviso `p_source_filter jsonb` (passato a tutte le RPC F1/F2/F4)
// ---------------------------------------------------------------------------

export const SourceCategoryEnum = z.enum([
  "tv",
  "web",
  "google",
  "meta",
  "organic",
  "referral",
  "other",
]);
export type SourceCategory = z.infer<typeof SourceCategoryEnum>;

export const SourceFilterSchema = z.object({
  category: SourceCategoryEnum.optional(),
  channel_id: z.string().uuid().optional(),
  campaign_id: z.string().uuid().optional(),
  group_id: z.string().uuid().optional(),
  tracking_number_id: z.string().uuid().optional(),
});
export type SourceFilter = z.infer<typeof SourceFilterSchema>;

/**
 * Parsing safe (per URL/localStorage). Ritorna `{}` se input non valido,
 * mai un crash — coerente con `mem://technical/client-state-resilience`.
 */
export function parseSourceFilter(input: unknown): SourceFilter {
  const r = SourceFilterSchema.safeParse(input);
  return r.success ? r.data : {};
}

// ---------------------------------------------------------------------------
// Periodo (riusa convenzioni CeoPeriodSelector)
// ---------------------------------------------------------------------------

export const PeriodPresetEnum = z.enum([
  "today",
  "yesterday",
  "last_7",
  "last_30",
  "last_90",
  "mtd",
  "qtd",
  "ytd",
  "custom",
]);
export type PeriodPreset = z.infer<typeof PeriodPresetEnum>;

export interface PeriodValue {
  preset: PeriodPreset;
  from?: string; // ISO date
  to?: string;   // ISO date
}

// ---------------------------------------------------------------------------
// Props del componente
// ---------------------------------------------------------------------------

export interface SourceFilterBarProps {
  value: SourceFilter;
  onChange: (next: SourceFilter) => void;
  period?: PeriodValue;
  onPeriodChange?: (next: PeriodValue) => void;
  /** Confronta A vs B (default off) */
  compareEnabled?: boolean;
  onCompareToggle?: (enabled: boolean) => void;
  /** Quando true mostra anche selezione "as-of date" (usato in Modulo C consegnato) */
  showAsOfDate?: boolean;
  asOfDate?: string;
  onAsOfDateChange?: (iso: string) => void;
  /** F5.2: nasconde periodo / toggle A/B (modalità "solo filtro fonte") */
  hidePeriod?: boolean;
  hideCompareToggle?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Componente stub (F0). Verrà esteso in F1 con tree-picker reale.
// ---------------------------------------------------------------------------

export function SourceFilterBar({
  value,
  onChange,
  period,
  onPeriodChange,
  compareEnabled = false,
  onCompareToggle,
  showAsOfDate = false,
  asOfDate,
  onAsOfDateChange,
  hidePeriod = false,
  hideCompareToggle = false,
  className = "",
}: SourceFilterBarProps) {
  const [localCompare, setLocalCompare] = useState(compareEnabled);

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (value.category) parts.push(value.category);
    if (value.group_id) parts.push("gruppo");
    if (value.channel_id) parts.push("canale");
    if (value.campaign_id) parts.push("campagna");
    if (value.tracking_number_id) parts.push("numero");
    return parts.length ? parts.join(" · ") : "Tutte le fonti";
  }, [value]);

  return (
    <Card
      className={`flex flex-wrap items-center gap-3 p-4 ${className}`}
      role="region"
      aria-label="Filtri sorgente dashboard"
    >
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Periodo</Label>
        <div className="flex gap-1">
          {(["last_7", "last_30", "mtd", "ytd"] as const).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period.preset === p ? "default" : "outline"}
              onClick={() => onPeriodChange({ preset: p })}
            >
              {p.replace("_", " ")}
            </Button>
          ))}
        </div>
      </div>

      <SourceFilterPicker value={value} onChange={onChange} summary={summary} />


      {showAsOfDate && (
        <div className="flex flex-col gap-1">
          <Label className="text-xs text-muted-foreground">Consegnato al</Label>
          <input
            type="date"
            value={asOfDate ?? ""}
            onChange={(e) => onAsOfDateChange?.(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Switch
          id="source-filter-compare"
          checked={localCompare}
          onCheckedChange={(v) => {
            setLocalCompare(v);
            onCompareToggle?.(v);
          }}
        />
        <Label htmlFor="source-filter-compare" className="text-sm">
          Confronta A/B
        </Label>
      </div>

      {/* Reset */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange({})}
        disabled={Object.keys(value).length === 0}
      >
        Reset
      </Button>
    </Card>
  );
}

export default SourceFilterBar;

// ---------------------------------------------------------------------------
// Tree-picker fonte (F1) — Popover con categoria / canale / campagna
// ---------------------------------------------------------------------------

const CATEGORIES: { value: SourceCategory; label: string }[] = [
  { value: "tv", label: "TV" },
  { value: "web", label: "Web" },
  { value: "google", label: "Google" },
  { value: "meta", label: "Meta" },
  { value: "organic", label: "Organico" },
  { value: "referral", label: "Referral" },
  { value: "other", label: "Altro" },
];

function SourceFilterPicker({
  value,
  onChange,
  summary,
}: {
  value: SourceFilter;
  onChange: (next: SourceFilter) => void;
  summary: string;
}) {
  const { data: channels } = useActiveMarketingChannels();
  const { data: campaigns } = useMarketingCampaigns();

  const filteredCampaigns = useMemo(() => {
    const list = campaigns ?? [];
    if (!value.channel_id) return list;
    return list.filter((c) => c.channel_id === value.channel_id);
  }, [campaigns, value.channel_id]);

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs text-muted-foreground">Fonte</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="min-w-[180px] justify-start">
            <Filter className="w-3.5 h-3.5 mr-2" />
            {summary}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4 space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select
              value={value.category ?? "__all__"}
              onValueChange={(v) =>
                onChange({ ...value, category: v === "__all__" ? undefined : (v as SourceCategory) })
              }
            >
              <SelectTrigger><SelectValue placeholder="Tutte" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutte</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Canale</Label>
            <Select
              value={value.channel_id ?? "__all__"}
              onValueChange={(v) =>
                onChange({
                  ...value,
                  channel_id: v === "__all__" ? undefined : v,
                  campaign_id: undefined, // reset campagna su cambio canale
                })
              }
            >
              <SelectTrigger><SelectValue placeholder="Tutti i canali" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutti i canali</SelectItem>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} <span className="text-muted-foreground text-xs">({c.type})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Campagna</Label>
            <Select
              value={value.campaign_id ?? "__all__"}
              onValueChange={(v) =>
                onChange({ ...value, campaign_id: v === "__all__" ? undefined : v })
              }
            >
              <SelectTrigger><SelectValue placeholder="Tutte le campagne" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Tutte le campagne</SelectItem>
                {filteredCampaigns.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => onChange({})}>
              Pulisci filtri
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
