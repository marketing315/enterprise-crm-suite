import { useMemo, useEffect, useState } from "react";
import { TicketWithRelations } from "@/hooks/useTickets";

export type QueueTab = "my_queue" | "unassigned" | "sla_breached" | "all";

// SLA thresholds in minutes
const SLA_THRESHOLDS = {
  1: 60,      // Priority 1: 1 hour
  2: 120,     // Priority 2: 2 hours
  3: 240,     // Priority 3: 4 hours
  4: 480,     // Priority 4: 8 hours
  5: 1440,    // Priority 5: 24 hours
} as const;

const STORAGE_KEY = "ticket-queue-preferences";

interface QueuePreferences {
  defaultTab: QueueTab;
  lastTab: QueueTab;
}

function getStoredPreferences(): QueuePreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return { defaultTab: "my_queue", lastTab: "my_queue" };
}

function storePreferences(prefs: Partial<QueuePreferences>) {
  try {
    const current = getStoredPreferences();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {
    // Ignore storage errors
  }
}

export function getAgeInMinutes(ticket: TicketWithRelations): number {
  const opened = new Date(ticket.opened_at).getTime();
  const now = Date.now();
  return Math.floor((now - opened) / 60000);
}

export function isSlaBreached(ticket: TicketWithRelations): boolean {
  // Only check open/in_progress/reopened tickets
  if (!["open", "in_progress", "reopened"].includes(ticket.status)) {
    return false;
  }
  
  const ageMinutes = getAgeInMinutes(ticket);
  const threshold = SLA_THRESHOLDS[ticket.priority as keyof typeof SLA_THRESHOLDS] ?? SLA_THRESHOLDS[3];
  
  return ageMinutes > threshold;
}

interface UseTicketQueueOptions {
  tickets: TicketWithRelations[];
  currentUserId: string | null;
  isOperator: boolean;
}

export function useTicketQueue({ tickets, currentUserId, isOperator }: UseTicketQueueOptions) {
  // Initialize from localStorage
  const [activeTab, setActiveTab] = useState<QueueTab>(() => {
    const prefs = getStoredPreferences();
    // Default to "my_queue" for operators, "all" for others
    if (!isOperator) return "all";
    return prefs.lastTab || "my_queue";
  });

  // Update localStorage when tab changes
  useEffect(() => {
    storePreferences({ lastTab: activeTab });
  }, [activeTab]);

  // Computed queue filters
  const queuedTickets = useMemo(() => {
    // Base filter: only active tickets for queue tabs
    const activeStatuses = ["open", "in_progress", "reopened"];
    
    switch (activeTab) {
      case "my_queue":
        return tickets.filter(
          (t) =>
            activeStatuses.includes(t.status) &&
            t.assigned_to_user_id === currentUserId
        );
      case "unassigned":
        return tickets.filter(
          (t) =>
            activeStatuses.includes(t.status) &&
            !t.assigned_to_user_id
        );
      case "sla_breached":
        return tickets.filter(
          (t) =>
            activeStatuses.includes(t.status) &&
            isSlaBreached(t)
        );
      case "all":
      default:
        return tickets;
    }
  }, [tickets, activeTab, currentUserId]);

  // Counts for tabs
  const counts = useMemo(() => {
    const activeStatuses = ["open", "in_progress", "reopened"];
    const activeTickets = tickets.filter((t) => activeStatuses.includes(t.status));
    
    return {
      myQueue: activeTickets.filter((t) => t.assigned_to_user_id === currentUserId).length,
      unassigned: activeTickets.filter((t) => !t.assigned_to_user_id).length,
      slaBreached: activeTickets.filter((t) => isSlaBreached(t)).length,
      all: tickets.length,
    };
  }, [tickets, currentUserId]);

  // Smart sorting: Priority ASC (P1 first), then aging DESC (oldest first)
  const sortedTickets = useMemo(() => {
    return [...queuedTickets].sort((a, b) => {
      // Priority first (lower = higher priority)
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      // Then by age (older first)
      return new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime();
    });
  }, [queuedTickets]);

  return {
    activeTab,
    setActiveTab,
    filteredTickets: sortedTickets,
    counts,
  };
}
