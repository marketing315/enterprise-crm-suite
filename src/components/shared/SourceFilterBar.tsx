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
  period: PeriodValue;
  onPeriodChange: (next: PeriodValue) => void;
  /** Confronta A vs B (default off) */
  compareEnabled?: boolean;
  onCompareToggle?: (enabled: boolean) => void;
  /** Quando true mostra anche selezione "as-of date" (usato in Modulo C consegnato) */
  showAsOfDate?: boolean;
  asOfDate?: string;
  onAsOfDateChange?: (iso: string) => void;
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

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Fonte</Label>
        <Button variant="outline" size="sm" disabled title="Tree-picker F1">
          {summary}
        </Button>
      </div>

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
