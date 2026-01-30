import { useState, useEffect } from "react";
import { Bell, CheckCheck, Trash2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { useBrand } from "@/contexts/BrandContext";
import {
  usePaginatedNotifications,
  useMarkAllNotificationsRead,
  useDeleteReadNotifications,
  useMarkNotificationsRead,
  Notification,
} from "@/hooks/useNotifications";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const notificationTypeLabels: Record<string, string> = {
  lead_event_created: "Lead",
  pipeline_stage_changed: "Pipeline",
  tags_updated: "Tag",
  appointment_created: "Appuntamento",
  appointment_updated: "Appuntamento",
  ticket_created: "Ticket",
  ticket_assigned: "Ticket",
  ticket_status_changed: "Ticket",
};

const notificationTypeColors: Record<string, string> = {
  lead_event_created: "bg-blue-500",
  pipeline_stage_changed: "bg-purple-500",
  tags_updated: "bg-green-500",
  appointment_created: "bg-orange-500",
  appointment_updated: "bg-orange-400",
  ticket_created: "bg-red-500",
  ticket_assigned: "bg-yellow-500",
  ticket_status_changed: "bg-gray-500",
};

const typeFilters = [
  { value: null, label: "Tutti" },
  { value: "lead_event_created", label: "Lead" },
  { value: "ticket_created", label: "Ticket" },
  { value: "ticket_assigned", label: "Assegnati" },
  { value: "pipeline_stage_changed", label: "Pipeline" },
  { value: "appointment_created", label: "Appuntamenti" },
];

const entityRoutes: Record<string, (id: string) => string> = {
  ticket: (id) => `/tickets?open=${id}`,
  contact: (id) => `/contacts?open=${id}`,
  deal: (id) => `/pipeline?deal=${id}`,
  appointment: (id) => `/appointments?open=${id}`,
  lead_event: (id) => `/events?event=${id}`,
};

export default function Notifications() {
  const navigate = useNavigate();
  const { currentBrand, isAllBrandsSelected } = useBrand();
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 30;

  const brandId = isAllBrandsSelected ? undefined : currentBrand?.id;

  const { data, isLoading, isFetching, refetch } = usePaginatedNotifications({
    brandId,
    typeFilter,
    unreadOnly,
    limit,
    offset,
  });

  const markAllRead = useMarkAllNotificationsRead();
  const deleteRead = useDeleteReadNotifications();
  const markRead = useMarkNotificationsRead();

  const notifications = data?.data || [];
  const total = data?.total || 0;
  const hasMore = offset + limit < total;

  const handleMarkAllRead = () => {
    markAllRead.mutate(brandId, {
      onSuccess: (count) => {
        toast.success(`${count} notifiche segnate come lette`);
        refetch();
      },
    });
  };

  const handleDeleteRead = () => {
    deleteRead.mutate(brandId, {
      onSuccess: (count) => {
        toast.success(`${count} notifiche eliminate`);
        refetch();
      },
    });
  };

  const handleNotificationClick = (notification: Notification) => {
    // Mark as read if unread
    if (!notification.read_at) {
      markRead.mutate([notification.id]);
    }

    // Navigate to entity if available
    if (notification.entity_type && notification.entity_id) {
      const routeBuilder = entityRoutes[notification.entity_type];
      if (routeBuilder) {
        navigate(routeBuilder(notification.entity_id));
      }
    }
  };

  const loadMore = () => {
    setOffset((prev) => prev + limit);
  };

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0);
  }, [typeFilter, unreadOnly, brandId]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-semibold">Centro Notifiche</h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              {total} notifiche totali
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllRead}
            disabled={markAllRead.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1.5" />
            Segna tutte lette
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeleteRead}
            disabled={deleteRead.isPending}
          >
            <Trash2 className="h-4 w-4 mr-1.5" />
            Elimina lette
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4 border-b pb-4">
        <Tabs
          value={typeFilter || "all"}
          onValueChange={(v) => setTypeFilter(v === "all" ? null : v)}
        >
          <TabsList className="h-9">
            {typeFilters.map((filter) => (
              <TabsTrigger
                key={filter.value || "all"}
                value={filter.value || "all"}
                className="text-xs px-3"
              >
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <Checkbox
            checked={unreadOnly}
            onCheckedChange={(checked) => setUnreadOnly(checked === true)}
          />
          Solo non lette
        </label>
      </div>

      {/* Notifications List */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bell className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">Nessuna notifica trovata</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onClick={() => handleNotificationClick(notification)}
              />
            ))}
          </div>
        )}

        {/* Load More */}
        {hasMore && (
          <div className="flex justify-center py-4">
            <Button
              variant="outline"
              onClick={loadMore}
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Carica altre ({total - offset - notifications.length} rimanenti)
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: () => void;
}) {
  const isUnread = !notification.read_at;
  const typeLabel = notificationTypeLabels[notification.type] || notification.type;
  const dotColor = notificationTypeColors[notification.type] || "bg-gray-400";
  const hasDeepLink = notification.entity_type && notification.entity_id;

  return (
    <div
      className={cn(
        "p-4 hover:bg-muted/50 cursor-pointer transition-colors flex items-start gap-3",
        isUnread && "bg-muted/30"
      )}
      onClick={onClick}
    >
      <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", dotColor)} />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="secondary" className="text-xs font-normal">
            {typeLabel}
          </Badge>
          {isUnread && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
              locale: it,
            })}
          </span>
        </div>
        <p className="text-sm font-medium">{notification.title}</p>
        {notification.body && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {notification.body}
          </p>
        )}
      </div>

      {hasDeepLink && (
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      )}
    </div>
  );
}
