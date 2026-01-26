import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { QueueTab, AssignmentTypeFilter, TicketCursor } from "./useTicketsSearch";

/**
 * Manages ticket list state in URL for refresh-safe, shareable navigation.
 * Syncs: tab, search query, tags, assignment type, cursor, direction, and page stack.
 */

interface TicketUrlState {
  tab: QueueTab;
  searchQuery: string;
  tagIds: string[];
  assignmentType: AssignmentTypeFilter;
  cursor: TicketCursor | null;
  direction: "next" | "prev";
  pageStack: TicketCursor[];
}

const DEFAULTS: TicketUrlState = {
  tab: "all",
  searchQuery: "",
  tagIds: [],
  assignmentType: "all",
  cursor: null,
  direction: "next",
  pageStack: [],
};

// Compact cursor serialization
function encodeCursor(cursor: TicketCursor | null): string {
  if (!cursor) return "";
  // Format: priority|opened_at|id (compact)
  return `${cursor.priority}|${cursor.opened_at}|${cursor.id}`;
}

function decodeCursor(str: string): TicketCursor | null {
  if (!str) return null;
  const parts = str.split("|");
  if (parts.length !== 3) return null;
  return {
    priority: parseInt(parts[0], 10),
    opened_at: parts[1],
    id: parts[2],
  };
}

// Stack serialization (array of cursors, semicolon-separated)
function encodeStack(stack: TicketCursor[]): string {
  if (stack.length === 0) return "";
  return stack.map(encodeCursor).join(";");
}

function decodeStack(str: string): TicketCursor[] {
  if (!str) return [];
  return str.split(";").map(decodeCursor).filter(Boolean) as TicketCursor[];
}

export function useTicketUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse current state from URL
  const state: TicketUrlState = useMemo(() => {
    const tab = (searchParams.get("tab") as QueueTab) || DEFAULTS.tab;
    const searchQuery = searchParams.get("q") || DEFAULTS.searchQuery;
    const tagIds = searchParams.get("tags")?.split(",").filter(Boolean) || DEFAULTS.tagIds;
    const assignmentType = (searchParams.get("assign") as AssignmentTypeFilter) || DEFAULTS.assignmentType;
    const cursor = decodeCursor(searchParams.get("cursor") || "");
    const direction = (searchParams.get("dir") as "next" | "prev") || DEFAULTS.direction;
    const pageStack = decodeStack(searchParams.get("stack") || "");

    return { tab, searchQuery, tagIds, assignmentType, cursor, direction, pageStack };
  }, [searchParams]);

  // Update URL with new state (merges with existing params)
  const updateUrl = useCallback((updates: Partial<TicketUrlState>) => {
    setSearchParams((prev) => {
      const newParams = new URLSearchParams(prev);

      // Tab
      if (updates.tab !== undefined) {
        if (updates.tab === DEFAULTS.tab) {
          newParams.delete("tab");
        } else {
          newParams.set("tab", updates.tab);
        }
      }

      // Search query
      if (updates.searchQuery !== undefined) {
        if (updates.searchQuery === DEFAULTS.searchQuery) {
          newParams.delete("q");
        } else {
          newParams.set("q", updates.searchQuery);
        }
      }

      // Tags
      if (updates.tagIds !== undefined) {
        if (updates.tagIds.length === 0) {
          newParams.delete("tags");
        } else {
          newParams.set("tags", updates.tagIds.join(","));
        }
      }

      // Assignment type
      if (updates.assignmentType !== undefined) {
        if (updates.assignmentType === DEFAULTS.assignmentType) {
          newParams.delete("assign");
        } else {
          newParams.set("assign", updates.assignmentType);
        }
      }

      // Cursor
      if (updates.cursor !== undefined) {
        const encoded = encodeCursor(updates.cursor);
        if (!encoded) {
          newParams.delete("cursor");
        } else {
          newParams.set("cursor", encoded);
        }
      }

      // Direction
      if (updates.direction !== undefined) {
        if (updates.direction === DEFAULTS.direction) {
          newParams.delete("dir");
        } else {
          newParams.set("dir", updates.direction);
        }
      }

      // Stack
      if (updates.pageStack !== undefined) {
        const encoded = encodeStack(updates.pageStack);
        if (!encoded) {
          newParams.delete("stack");
        } else {
          newParams.set("stack", encoded);
        }
      }

      return newParams;
    }, { replace: true });
  }, [setSearchParams]);

  // Reset pagination state (when filters change)
  const resetPagination = useCallback(() => {
    updateUrl({
      cursor: null,
      direction: "next",
      pageStack: [],
    });
  }, [updateUrl]);

  // Reset all filters and pagination
  const resetAll = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  return {
    state,
    updateUrl,
    resetPagination,
    resetAll,
  };
}
