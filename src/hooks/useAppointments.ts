import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import type { AppointmentStatus, AppointmentWithRelations } from "@/types/database";

interface AppointmentSearchParams {
  dateFrom?: string;
  dateTo?: string;
  status?: AppointmentStatus;
  salesUserId?: string;
  contactId?: string;
}

interface AppointmentSearchResult {
  total: number;
  limit: number;
  offset: number;
  appointments: AppointmentWithRelations[];
}

export function useAppointments(params: AppointmentSearchParams = {}) {
  const { currentBrand } = useBrand();

  return useQuery({
    queryKey: ["appointments", currentBrand?.id, params],
    queryFn: async (): Promise<AppointmentSearchResult> => {
      if (!currentBrand?.id) {
        return { total: 0, limit: 100, offset: 0, appointments: [] };
      }

      const { data, error } = await supabase.rpc("search_appointments", {
        p_brand_id: currentBrand.id,
        p_date_from: params.dateFrom || null,
        p_date_to: params.dateTo || null,
        p_status: params.status || null,
        p_sales_user_id: params.salesUserId || null,
        p_contact_id: params.contactId || null,
        p_limit: 100,
        p_offset: 0,
      });

      if (error) throw error;

      return data as unknown as AppointmentSearchResult;
    },
    enabled: !!currentBrand?.id,
  });
}

interface CreateAppointmentParams {
  contactId: string;
  dealId?: string;
  scheduledAt: string;
  durationMinutes?: number;
  address?: string;
  city?: string;
  cap?: string;
  notes?: string;
  assignedSalesUserId?: string;
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (params: CreateAppointmentParams) => {
      if (!currentBrand?.id) throw new Error("No brand selected");

      const { data, error } = await supabase.rpc("create_appointment", {
        p_brand_id: currentBrand.id,
        p_contact_id: params.contactId,
        p_deal_id: params.dealId || null,
        p_scheduled_at: params.scheduledAt,
        p_duration_minutes: params.durationMinutes || 60,
        p_address: params.address || null,
        p_city: params.city || null,
        p_cap: params.cap || null,
        p_notes: params.notes || null,
        p_assigned_sales_user_id: params.assignedSalesUserId || null,
      });

      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      appointmentId: string;
      scheduledAt?: string;
      durationMinutes?: number;
      address?: string;
      city?: string;
      cap?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.rpc("update_appointment", {
        p_appointment_id: params.appointmentId,
        p_scheduled_at: params.scheduledAt || null,
        p_duration_minutes: params.durationMinutes || null,
        p_address: params.address || null,
        p_city: params.city || null,
        p_cap: params.cap || null,
        p_notes: params.notes || null,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useAssignAppointmentSales() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { appointmentId: string; salesUserId: string }) => {
      const { error } = await supabase.rpc("assign_appointment_sales", {
        p_appointment_id: params.appointmentId,
        p_sales_user_id: params.salesUserId,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}

export function useSetAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { appointmentId: string; status: AppointmentStatus }) => {
      const { error } = await supabase.rpc("set_appointment_status", {
        p_appointment_id: params.appointmentId,
        p_status: params.status,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
  });
}
