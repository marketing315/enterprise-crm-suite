import { useState, useCallback, useEffect, useRef } from "react";
import { useContactSearch, useContactCount, type ContactSearchFilters, type SearchResult } from "./useContactSearch";

const PAGE_SIZE = 50;

export function usePaginatedContactSearch(
  query: string,
  filters: ContactSearchFilters = {},
  showAll = false
) {
  const [allResults, setAllResults] = useState<SearchResult[]>([]);
  const [page, setPage] = useState(0);
  const prevKeyRef = useRef("");
  const loadTriggeredRef = useRef(false);

  const effectiveLimit = showAll ? 10000 : PAGE_SIZE;

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
    showAll,
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

  const offset = showAll ? 0 : page * PAGE_SIZE;

  const { data: pageData = [], isLoading, isFetching, isError, error, refetch } = useContactSearch(
    query,
    filters,
    effectiveLimit,
    offset
  );

  const { data: totalCount } = useContactCount(query, filters);

  // Append new page data when it arrives and reset the load guard
  useEffect(() => {
    if (pageData.length > 0) {
      setAllResults((prev) => {
        if (page === 0 || showAll) return pageData;
        const existingIds = new Set(prev.map((r) => r.id));
        const newItems = pageData.filter((r) => !existingIds.has(r.id));
        return [...prev, ...newItems];
      });
      loadTriggeredRef.current = false;
    } else if (page === 0) {
      setAllResults([]);
      loadTriggeredRef.current = false;
    } else if (!isFetching) {
      loadTriggeredRef.current = false;
    }
  }, [pageData, page, isFetching, showAll]);

  // Reset guard on query error
  useEffect(() => {
    if (isError) {
      loadTriggeredRef.current = false;
    }
  }, [isError]);

  const loadMore = useCallback(() => {
    if (showAll) return;
    if (loadTriggeredRef.current) return;
    loadTriggeredRef.current = true;
    setPage((p) => p + 1);
  }, [showAll]);

  const hasMore = !showAll && pageData.length === effectiveLimit;
  const contacts = allResults;

  return {
    contacts,
    isLoading: isLoading && page === 0,
    isLoadingMore: isFetching && page > 0,
    isError,
    error,
    refetch,
    hasMore,
    loadMore,
    totalLoaded: allResults.length,
    totalCount: totalCount ?? null,
  };
}
