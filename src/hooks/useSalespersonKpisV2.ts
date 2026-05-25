/**
 * F4 + F5.8 — Hook KPI venditori v2 (+ estensione cohort / VAT per riga)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SalespersonKpiRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  appuntamenti_programmati: number;
  appuntamenti_eseguiti: number;
  no_show: number;
  cancellati: number;
  perc_esecuzione: number;
  ordini_venduti: number;
  perc_vendita: number;
  lordo: number;
  imponibile: number;
  consegnati_periodo: number;
  perc_consegne_periodo: number;
  bonus: {
    tier_id: string | null;
    tier_label: string | null;
    bonus_amount: number;
    bonus_percent: number | null;
    threshold_gross?: number | null;
  };
}

export interface SalespersonKpiV2Response {
  period: { from: string; to: string };
  rows: SalespersonKpiRow[];
  calc_version: string;
}

export interface SalespersonKpiAggregate {
  period: { from: string; to: string };
  total_sellers: number;
  appuntamenti_programmati: number;
  appuntamenti_eseguiti: number;
  no_show: number;
  cancellati: number;
  ordini_venduti: number;
  lordo: number;
  imponibile: number;
  consegnati_periodo: number;
  bonus_totale: number;
  calc_version: string;
}

export function useSalespersonKpisV2(
  brandId: string | null,
  from: Date | null,
  to: Date | null,
  userIds: string[] | null = null
) {
  return useQuery({
    queryKey: ["salesperson-kpis-v2", brandId, from?.toISOString(), to?.toISOString(), userIds?.join(",")],
    enabled: !!brandId,
    queryFn: async (): Promise<SalespersonKpiV2Response> => {
      const { data, error } = await supabase.rpc("get_salesperson_kpis_v2", {
        p_brand_id: brandId!,
        p_from: from ? from.toISOString() : undefined,
        p_to: to ? to.toISOString() : undefined,
        p_user_ids: userIds ?? undefined,
      });
      if (error) throw error;
      return data as unknown as SalespersonKpiV2Response;
    },
  });
}

export function useSalespersonKpisAggregate(
  brandId: string | null,
  from: Date | null,
  to: Date | null
) {
  return useQuery({
    queryKey: ["salesperson-kpis-aggregate", brandId, from?.toISOString(), to?.toISOString()],
    enabled: !!brandId,
    queryFn: async (): Promise<SalespersonKpiAggregate> => {
      const { data, error } = await supabase.rpc("get_salesperson_kpis_aggregate", {
        p_brand_id: brandId!,
        p_from: from ? from.toISOString() : undefined,
        p_to: to ? to.toISOString() : undefined,
      });
      if (error) throw error;
      return data as unknown as SalespersonKpiAggregate;
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// F5.8 — versione estesa: cohort delivery + VAT per riga
// ─────────────────────────────────────────────────────────────────────────────

export type TaxableMode = "effective" | "flat" | "itemized";

export interface SalespersonKpiRowExt extends SalespersonKpiRow {
  cohort_orders_count: number;
  delivered_count_period: number;
  delivered_amount_period: number;
  delivered_count_cohort: number;
  delivered_amount_cohort: number;
  perc_delivered_on_sold_period: number | null;
  perc_delivered_on_sold_cohort: number | null;
  taxable_basis: "itemized" | "flat_22" | "mixed" | null;
}

export interface SalespersonKpiV2ExtResponse {
  period: { from: string; to: string; as_of: string; taxable_mode: TaxableMode };
  rows: SalespersonKpiRowExt[];
  calc_version: string;
}

export function useSalespersonKpisV2Ext(
  brandId: string | null,
  from: Date | null,
  to: Date | null,
  opts: { taxableMode?: TaxableMode; userIds?: string[] | null; asOf?: Date | null } = {},
) {
  const { taxableMode = "effective", userIds = null, asOf = null } = opts;
  return useQuery({
    queryKey: ["salesperson-kpis-v2-ext", brandId, from?.toISOString(), to?.toISOString(), taxableMode, asOf?.toISOString(), userIds?.join(",")],
    enabled: !!brandId,
    queryFn: async (): Promise<SalespersonKpiV2ExtResponse> => {
      const { data, error } = await supabase.rpc("get_salesperson_kpis_v2_ext", {
        p_brand_id: brandId!,
        p_from: from ? from.toISOString() : undefined,
        p_to: to ? to.toISOString() : undefined,
        p_user_ids: userIds ?? undefined,
        p_as_of_date: asOf ? asOf.toISOString() : undefined,
        p_taxable_mode: taxableMode,
      });
      if (error) throw error;
      return data as unknown as SalespersonKpiV2ExtResponse;
    },
  });
}
