import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { TicketStatus } from "@/hooks/useTickets";

export interface BulkUpdateParams {
  ticketIds: string[];
  status?: TicketStatus;
  priority?: number;
  categoryTagId?: string | null;
  assignToUserId?: string | null;
}

export function useTicketBulkUpdate() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async ({ ticketIds, status, priority, categoryTagId, assignToUserId }: BulkUpdateParams) => {
      if (!currentBrand?.id || ticketIds.length === 0) {
        throw new Error("No brand or tickets selected");
      }

      // Build update object dynamically
      const updates: Record<string, unknown> = {};

      if (status !== undefined) {
        updates.status = status;
        if (status === "resolved") {
          updates.resolved_at = new Date().toISOString();
        } else if (status === "closed") {
          updates.closed_at = new Date().toISOString();
        } else if (status === "reopened") {
          updates.resolved_at = null;
          updates.closed_at = null;
        }
      }

      if (priority !== undefined) {
        updates.priority = priority;
      }

      if (categoryTagId !== undefined) {
        updates.category_tag_id = categoryTagId;
      }

      if (assignToUserId !== undefined) {
        updates.assigned_to_user_id = assignToUserId;
        updates.assigned_at = assignToUserId ? new Date().toISOString() : null;

        // Get current user for assigned_by
        if (assignToUserId) {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            const { data: currentUserData } = await supabase
              .from("users")
              .select("id")
              .eq("supabase_auth_id", authUser.id)
              .single();

            if (currentUserData) {
              updates.assigned_by_user_id = currentUserData.id;
            }
          }
        } else {
          updates.assigned_by_user_id = null;
        }
      }

      // Only update if we have something to update
      if (Object.keys(updates).length === 0) {
        return { updated: 0 };
      }

      const { error, count } = await supabase
        .from("tickets")
        .update(updates)
        .eq("brand_id", currentBrand.id)
        .in("id", ticketIds);

      if (error) throw error;

      return { updated: count || ticketIds.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });
}

export function useTicketBulkAssignToMe() {
  const queryClient = useQueryClient();
  const { currentBrand } = useBrand();

  return useMutation({
    mutationFn: async (ticketIds: string[]) => {
      if (!currentBrand?.id || ticketIds.length === 0) {
        throw new Error("No brand or tickets selected");
      }

      // Get current user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("Not authenticated");

      const { data: currentUserData } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_auth_id", authUser.id)
        .single();

      if (!currentUserData) throw new Error("User not found");

      const { error, count } = await supabase
        .from("tickets")
        .update({
          assigned_to_user_id: currentUserData.id,
          assigned_at: new Date().toISOString(),
          assigned_by_user_id: currentUserData.id,
        })
        .eq("brand_id", currentBrand.id)
        .in("id", ticketIds);

      if (error) throw error;

      return { updated: count || ticketIds.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
      queryClient.invalidateQueries({ queryKey: ["ticket"] });
    },
  });
}
