import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

// Types
export interface Notification {
  id: string;
  brand_id: string;
  user_id?: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  user_id: string;
  brand_id: string;
  notification_type: string;
  enabled: boolean;
  created_at: string;
}

interface PaginatedNotificationsResult {
  data: Notification[];
  total: number;
  limit: number;
  offset: number;
}

export function useNotifications(limit: number = 50) {
  const { currentBrand, isAllBrandsSelected, allBrandIds } = useBrand();

  return useQuery({
    queryKey: ["notifications", currentBrand?.id, isAllBrandsSelected],
    queryFn: async (): Promise<Notification[]> => {
      let query = supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (isAllBrandsSelected) {
        query = query.in("brand_id", allBrandIds);
      } else if (currentBrand) {
        query = query.eq("brand_id", currentBrand.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!currentBrand || isAllBrandsSelected,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useUnreadNotificationCount() {
  const { currentBrand, isAllBrandsSelected } = useBrand();

  return useQuery({
    queryKey: ["unread-notification-count", currentBrand?.id, isAllBrandsSelected],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("get_unread_notification_count", {
        p_brand_id: isAllBrandsSelected ? null : currentBrand?.id || null,
      });

      if (error) throw error;
      return (data as number) || 0;
    },
    enabled: !!currentBrand || isAllBrandsSelected,
    refetchInterval: 10000, // Refetch every 10 seconds
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const { data, error } = await supabase.rpc("mark_notifications_read", {
        p_notification_ids: notificationIds,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
    },
    onError: (error: Error) => {
      console.error("Error marking notifications as read:", error);
      toast.error("Errore nel segnare le notifiche come lette");
    },
  });
}

export function useNotificationRealtime(onNewNotification?: (notification: Notification) => void) {
  const queryClient = useQueryClient();

  // Subscribe to realtime notifications
  const subscribeToNotifications = () => {
    const channel = supabase
      .channel("notifications-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
        },
        (payload) => {
          const notification = payload.new as Notification;
          
          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["notifications"] });
          queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
          queryClient.invalidateQueries({ queryKey: ["paginated-notifications"] });
          
          // Call callback if provided
          if (onNewNotification) {
            onNewNotification(notification);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  };

  return { subscribeToNotifications };
}

// =============================================
// Paginated notifications with filters
// =============================================
export function usePaginatedNotifications({
  brandId,
  typeFilter,
  unreadOnly,
  limit = 50,
  offset = 0,
}: {
  brandId?: string;
  typeFilter?: string | null;
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: ["paginated-notifications", brandId, typeFilter, unreadOnly, limit, offset],
    queryFn: async (): Promise<PaginatedNotificationsResult> => {
      const { data, error } = await supabase.rpc("get_paginated_notifications", {
        p_brand_id: brandId || null,
        p_type_filter: typeFilter || null,
        p_unread_only: unreadOnly || false,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) throw error;
      return data as unknown as PaginatedNotificationsResult;
    },
    staleTime: 30000,
  });
}

// =============================================
// Mark all notifications as read
// =============================================
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brandId?: string) => {
      const { data, error } = await supabase.rpc("mark_all_notifications_read", {
        p_brand_id: brandId || null,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["paginated-notifications"] });
    },
    onError: (error: Error) => {
      console.error("Error marking all notifications as read:", error);
      toast.error("Errore nel segnare tutte le notifiche come lette");
    },
  });
}

// =============================================
// Delete specific notifications
// =============================================
export function useDeleteNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationIds: string[]) => {
      const { data, error } = await supabase.rpc("delete_notifications", {
        p_notification_ids: notificationIds,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["paginated-notifications"] });
    },
    onError: (error: Error) => {
      console.error("Error deleting notifications:", error);
      toast.error("Errore nell'eliminazione delle notifiche");
    },
  });
}

// =============================================
// Delete all read notifications
// =============================================
export function useDeleteReadNotifications() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (brandId?: string) => {
      const { data, error } = await supabase.rpc("delete_read_notifications", {
        p_brand_id: brandId || null,
      });

      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notification-count"] });
      queryClient.invalidateQueries({ queryKey: ["paginated-notifications"] });
    },
    onError: (error: Error) => {
      console.error("Error deleting read notifications:", error);
      toast.error("Errore nell'eliminazione delle notifiche lette");
    },
  });
}

// =============================================
// Notification preferences
// =============================================
export function useNotificationPreferences(brandId: string) {
  return useQuery({
    queryKey: ["notification-preferences", brandId],
    queryFn: async (): Promise<NotificationPreference[]> => {
      const { data, error } = await supabase.rpc("get_notification_preferences", {
        p_brand_id: brandId,
      });

      if (error) throw error;
      return (data || []) as NotificationPreference[];
    },
    enabled: !!brandId,
  });
}

export function useUpsertNotificationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      brandId,
      notificationType,
      enabled,
    }: {
      brandId: string;
      notificationType: string;
      enabled: boolean;
    }) => {
      const { data, error } = await supabase.rpc("upsert_notification_preference", {
        p_brand_id: brandId,
        p_notification_type: notificationType,
        p_enabled: enabled,
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["notification-preferences", variables.brandId],
      });
    },
    onError: (error: Error) => {
      console.error("Error upserting notification preference:", error);
      toast.error("Errore nel salvare la preferenza");
    },
  });
}
