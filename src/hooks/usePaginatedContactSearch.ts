import { useState, useCallback, useEffect, useRef } from "react";
import { useContactSearch, type ContactSearchFilters, type SearchResult } from "./useContactSearch";

const PAGE_SIZE = 50;

export function usePaginatedContactSearch(
  query: string,
  filters: ContactSearchFilters = {}
) {
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(0);
  const prevKeyRef = useRef("");
  const loadTriggeredRef = useRef(false);

  // Build a stable key to detect filter/query changes
  const filterKey = JSON.stringify([
    query,
    filters.status,
    filters.createdFrom?.toISOString(),
    filters.createdTo?.toISOString(),
    filters.sourceName,
    filters.tagIds,
    filters.sortBy,
    filters.sortDir,
  ]);

  // Reset when filters/query change
  useEffect(() => {
    if (filterKey !== prevKeyRef.current) {
      prevKeyRef.current = filterKey;
      setPage(0);
      setAllResults([]);
      loadTriggeredRef.current = false;
    }
  }, [filterKey]);

  const offset = page * PAGE_SIZE;

  const { data: pageData = [], isLoading, isFetching, isError } = useContactSearch(
    query,
    filters,
    PAGE_SIZE,
    offset
  );

  // Append new page data when it arrives and reset the load guard
  useEffect(() => {
    if (pageData.length > 0) {
      setAllResults((prev) => {
        if (page === 0) return pageData;
        const existingIds = new Set(prev.map((r) => r.id));
        const newItems = pageData.filter((r) => !existingIds.has(r.id));
        return [...prev, ...newItems];
      });
      loadTriggeredRef.current = false;
    } else if (page === 0) {
      setAllResults([]);
      loadTriggeredRef.current = false;
    } else if (!isFetching) {
      // R04: Reset guard when fetch finished with empty data (end of list or error)
      loadTriggeredRef.current = false;
    }
  }, [pageData, page, isFetching]);

  // R04: Also reset guard on query error so "load more" doesn't stay stuck
  useEffect(() => {
    if (isError) {
      loadTriggeredRef.current = false;
    }
  }, [isError]);

  const loadMore = useCallback(() => {
    // Prevent multiple rapid increments before isFetching kicks in
    if (loadTriggeredRef.current) return;
    loadTriggeredRef.current = true;
    setPage((p) => p + 1);
  }, []);

  const hasMore = pageData.length === PAGE_SIZE;
  const contacts = allResults;

  return {
    contacts,
    isLoading: isLoading && page === 0,
    isLoadingMore: isFetching && page > 0,
    hasMore,
    loadMore,
    totalLoaded: allResults.length,
  };
}
