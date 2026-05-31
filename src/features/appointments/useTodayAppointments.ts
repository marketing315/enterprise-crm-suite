/**
 * useTodayAppointments — fetch today's appointments for the logged-in salesperson.
 * Includes terminal statuses so we can show already-recorded outcomes.
 */
import { useQuery } from "@tanstack/react-query";
import { startOfDay, endOfDay } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useBrandFilter } from "@/hooks/useBrandFilter";
import { supabase } from "@/integrations/supabase/client";

export interface TodayAppointment {
  id: string;
  scheduled_at: string;
  status: string;
  last_outcome_code: string | null;
  risk_score: number | null;
  address: string | null;
  city: string | null;
  appointment_type: string | null;
  deal_id: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

export function useTodayAppointments() {
  const { user } = useAuth();
  const { getBrandIds, getQueryKeyBrand, isQueryEnabled } = useBrandFilter();
  const dayISO = startOfDay(new Date()).toISOString().slice(0, 10);

  return useQuery({
    queryKey: ["salesperson-appointments-day", user?.id, getQueryKeyBrand(), dayISO],
    queryFn: async (): Promise<TodayAppointment[]> => {
      if (!user?.id) return [];
      const brandIds = getBrandIds();
      if (brandIds.length === 0) return [];

      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      let query = supabase
        .from("appointments")
        .select(
          `id, scheduled_at, status, last_outcome_code, risk_score, address, city, appointment_type, deal_id,
           contact:contacts(id, first_name, last_name, phone, email)`
        )
        .eq("assigned_sales_user_id", user.id)
        .gte("scheduled_at", todayStart)
        .lte("scheduled_at", todayEnd)
        .order("scheduled_at", { ascending: true });

      query = brandIds.length === 1
        ? query.eq("brand_id", brandIds[0])
        : query.in("brand_id", brandIds);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as TodayAppointment[];
    },
    enabled: !!user?.id && isQueryEnabled(),
  });
}
