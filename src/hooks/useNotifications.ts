import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useBrand } from "@/contexts/BrandContext";
import { toast } from "sonner";

// Types
export interface Notification {
  id: string;
  brand_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
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
