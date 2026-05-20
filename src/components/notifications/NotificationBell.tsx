import { useState, useEffect } from "react";
import { Bell, ChevronRight, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";
import { Link, useNavigate } from "react-router-dom";
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationsRead,
  useNotificationRealtime,
  Notification,
} from "@/hooks/useNotifications";
import { useNotificationSound, CRITICAL_NOTIFICATION_TYPES } from "@/hooks/useNotificationSound";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useCallback } from "react";

const entityRoutes: Record<string, (id: string) => string> = {
  ticket: (id) => `/tickets?open=${id}`,
  contact: (id) => `/contacts?open=${id}`,
  deal: (id) => `/pipeline?deal=${id}`,
  appointment: (id) => `/appointments/${id}`,
  lead_event: (id) => `/events?event=${id}`,
};

const notificationTypeLabels: Record<string, string> = {
  lead_event_created: "Nuovo Lead",
  pipeline_stage_changed: "Cambio Stage",
  tags_updated: "Tag Aggiornati",
  appointment_created: "Appuntamento Creato",
  appointment_updated: "Appuntamento Modificato",
  appointment_reminder: "Promemoria Appuntamento",
  appointment_risk_alert: "⚠️ Appuntamento a Rischio",
  ticket_created: "Nuovo Ticket",
  ticket_assigned: "Ticket Assegnato",
  ticket_status_changed: "Stato Ticket",
};

const notificationTypeColors: Record<string, string> = {
  lead_event_created: "bg-blue-500",
  pipeline_stage_changed: "bg-purple-500",
  tags_updated: "bg-green-500",
  appointment_created: "bg-orange-500",
  appointment_updated: "bg-orange-400",
  appointment_reminder: "bg-amber-500",
  appointment_risk_alert: "bg-destructive",
  ticket_created: "bg-red-500",
  ticket_assigned: "bg-yellow-500",
  ticket_status_changed: "bg-gray-500",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data: notifications = [], isLoading } = useNotifications(30);
  const { data: unreadCount = 0 } = useUnreadNotificationCount();
  const markRead = useMarkNotificationsRead();
  const { soundEnabled, setSoundEnabled, playSound } = useNotificationSound();

  // Realtime subscription (hook manages its own lifecycle now)
  const handleNewNotification = useCallback((notification: Notification) => {
    toast.info(notification.title, {
      description: notification.body || undefined,
    });
    if (CRITICAL_NOTIFICATION_TYPES.has(notification.type)) {
      playSound();
    }
  }, [playSound]);
  useNotificationRealtime(handleNewNotification);

  // Mark as read when popover opens
  useEffect(() => {
    if (open && notifications.length > 0) {
      const unreadIds = notifications
        .filter((n) => !n.read_at)
        .map((n) => n.id);
      if (unreadIds.length > 0) {
        markRead.mutate(unreadIds);
      }
    }
  }, [open, notifications]);

  const handleNotificationClick = (notification: Notification) => {
    setOpen(false);
    
    // Navigate to entity if available
    if (notification.entity_type && notification.entity_id) {
      const routeBuilder = entityRoutes[notification.entity_type];
      if (routeBuilder) {
        navigate(routeBuilder(notification.entity_id));
      }
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label="Notifiche"
          data-tour="notifications"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1.5 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="font-semibold">Notifiche</h4>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unreadCount} non lette
              </span>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() = aria-label="Volume"> setSoundEnabled(!soundEnabled)}
                    aria-label={soundEnabled ? "Disattiva suono" : "Attiva suono"}
                  >
                    {soundEnabled ? (
                      <Volume2 className="h-3.5 w-3.5" />
                    ) : (
                      <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  Suono notifiche critiche
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
        <ScrollArea className="h-80">
          {isLoading ? (
            <div className="flex items-center justify-center p-6">
              <span className="text-sm text-muted-foreground">Caricamento...</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-6 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <span className="text-sm text-muted-foreground">
                Nessuna notifica
              </span>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center text-xs"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link to="/notifications">
              Vedi tutte le notifiche
              <ChevronRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationItem({ 
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
    <button
      type="button"
      className={cn(
        "w-full text-left p-3 hover:bg-muted/50 cursor-pointer transition-colors border-0 bg-transparent",
        isUnread && "bg-muted/30"
      )}
      onClick={onClick}
    >
      <div className="flex gap-3">
        <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", dotColor)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-medium text-muted-foreground">
              {typeLabel}
            </span>
            {isUnread && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            )}
          </div>
          <p className="text-sm font-medium truncate">{notification.title}</p>
          {notification.body && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
              {notification.body}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(notification.created_at), {
              addSuffix: true,
              locale: it,
            })}
          </p>
        </div>
        {hasDeepLink && (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 self-center" />
        )}
      </div>
    </button>
  );
}
