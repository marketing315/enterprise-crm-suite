import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";

export interface SalesAvailabilitySlot {
  id: string;
  brand_id: string;
  user_id: string;
  weekday: number; // 0=Sun ... 6=Sat
  start_time: string; // 'HH:MM:SS'
  end_time: string;
  valid_from: string;
  valid_to: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SalesTimeOff {
  id: string;
  brand_id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  off_type: "vacation" | "sick" | "personal" | "training" | "other";
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface SalesCapacityRow {
  user_id: string;
  full_name: string | null;
  email: string;
  available_minutes: number;
  booked_minutes: number;
  appointment_count: number;
  working_days: number;
  utilization_pct: number | null;
}

export const WEEKDAY_LABELS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
export const WEEKDAY_LABELS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/**
 * List availability slots for a brand (optionally filtered by user).
 */
export function useSalesAvailability(userId?: string) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["sales-availability", currentBrand?.id, userId],
    enabled: !!currentBrand?.id,
    queryFn: async (): Promise<SalesAvailabilitySlot[]> => {
      let q = supabase
        .from("sales_availability")
        .select("*")
        .eq("brand_id", currentBrand!.id)
        .eq("is_active", true)
        .order("weekday")
        .order("start_time")
        .limit(500);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SalesAvailabilitySlot[];
    },
  });
}

export function useSalesTimeOff(userId?: string) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["sales-time-off", currentBrand?.id, userId],
    enabled: !!currentBrand?.id,
    queryFn: async (): Promise<SalesTimeOff[]> => {
      let q = supabase
        .from("sales_time_off")
        .select("*")
        .eq("brand_id", currentBrand!.id)
        .gte("end_date", new Date().toISOString().slice(0, 10))
        .order("start_date", { ascending: true })
        .limit(500);
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SalesTimeOff[];
    },
  });
}

export function useSalesCapacity(dateFrom: string, dateTo: string) {
  const { currentBrand } = useBrand();
  return useQuery({
    queryKey: ["sales-capacity", currentBrand?.id, dateFrom, dateTo],
    enabled: !!currentBrand?.id,
    queryFn: async (): Promise<SalesCapacityRow[]> => {
      const { data, error } = await supabase.rpc("get_sales_capacity", {
        p_brand_id: currentBrand!.id,
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });
      if (error) throw error;
      return (data as unknown as SalesCapacityRow[]) ?? [];
    },
    staleTime: 60_000,
  });
}

// ============= MUTATIONS =============

export function useCreateAvailabilitySlot() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      weekday: number;
      startTime: string;
      endTime: string;
      validFrom?: string;
      validTo?: string | null;
      notes?: string | null;
    }) => {
      if (!currentBrand?.id) throw new Error("Brand non selezionato");
      const { data, error } = await supabase
        .from("sales_availability")
        .insert({
          brand_id: currentBrand.id,
          user_id: params.userId,
          weekday: params.weekday,
          start_time: params.startTime,
          end_time: params.endTime,
          valid_from: params.validFrom ?? new Date().toISOString().slice(0, 10),
          valid_to: params.validTo ?? null,
          notes: params.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-availability"] });
      queryClient.invalidateQueries({ queryKey: ["sales-capacity"] });
    },
  });
}

export function useDeleteAvailabilitySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (slotId: string) => {
      // Soft delete via is_active=false to preserve history
      const { error } = await supabase
        .from("sales_availability")
        .update({ is_active: false })
        .eq("id", slotId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-availability"] });
      queryClient.invalidateQueries({ queryKey: ["sales-capacity"] });
    },
  });
}

export function useCreateTimeOff() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();
  return useMutation({
    mutationFn: async (params: {
      userId: string;
      startDate: string;
      endDate: string;
      offType: SalesTimeOff["off_type"];
      reason?: string | null;
    }) => {
      if (!currentBrand?.id) throw new Error("Brand non selezionato");
      const { data, error } = await supabase
        .from("sales_time_off")
        .insert({
          brand_id: currentBrand.id,
          user_id: params.userId,
          start_date: params.startDate,
          end_date: params.endDate,
          off_type: params.offType,
          reason: params.reason ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-time-off"] });
      queryClient.invalidateQueries({ queryKey: ["sales-capacity"] });
    },
  });
}

export function useDeleteTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_time_off").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-time-off"] });
      queryClient.invalidateQueries({ queryKey: ["sales-capacity"] });
    },
  });
}
