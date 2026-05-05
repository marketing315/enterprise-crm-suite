import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface SalesRouteSchedule {
  id: string;
  brand_id: string;
  is_active: boolean;
  days_of_week: number[];
  send_at_local: string;
  timezone: string;
  recipients_mode: string;
  aggregate_recipient_user_ids: string[];
  aggregate_extra_emails: string[];
  send_aggregate: boolean;
  last_run_at: string | null;
  last_run_status: string | null;
}

export function useSalesRouteSchedule() {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;

  return useQuery({
    queryKey: ["sales-route-schedule", brandId],
    enabled: !!brandId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_route_schedules" as any)
        .select("*")
        .eq("brand_id", brandId!)
        .maybeSingle();
      if (error) throw error;
      return (data as SalesRouteSchedule | null) ?? null;
    },
  });
}

export function useUpsertSalesRouteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<SalesRouteSchedule> & { brand_id: string }) => {
      const { data, error } = await supabase.rpc(
        "upsert_sales_route_schedule" as any,
        { p_payload: payload as any },
      );
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["sales-route-schedule", vars.brand_id] });
    },
  });
}

export function useSalesRouteRecipients(routeDate: string | null) {
  const { currentBrand } = useBrand();
  const brandId = currentBrand?.id;
  return useQuery({
    queryKey: ["sales-route-recipients", brandId, routeDate],
    enabled: !!brandId && !!routeDate,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_sales_route_recipients_default" as any,
        { p_brand_id: brandId!, p_date: routeDate! },
      );
      if (error) throw error;
      return (data || []) as Array<{
        user_id: string; full_name: string | null; email: string | null; appointments_count: number;
      }>;
    },
  });
}

export async function fetchRoutePreview(opts: {
  brandId: string;
  routeDate: string;
  mode: "individual" | "aggregate";
  userId?: string;
}): Promise<{ html: string; subject: string; count: number; sellers?: number }> {
  const { data, error } = await supabase.functions.invoke("sales-route-preview", {
    body: {
      brand_id: opts.brandId,
      route_date: opts.routeDate,
      mode: opts.mode,
      user_id: opts.userId,
    },
  });
  if (error) throw error;
  return data;
}

export async function dispatchRouteNow(opts: {
  brandId: string;
  routeDate: string;
  audience?: "sales" | "managers" | "both";
  userIds?: string[];
}): Promise<any> {
  const { data, error } = await supabase.functions.invoke("sales-route-dispatcher", {
    body: {
      brand_id: opts.brandId,
      route_date: opts.routeDate,
      audience: opts.audience ?? "both",
      user_ids: opts.userIds,
    },
  });
  if (error) throw error;
  return data;
}
