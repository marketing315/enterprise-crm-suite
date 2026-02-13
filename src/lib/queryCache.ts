/**
 * Centralized React Query cache configuration.
 *
 * Three tiers control how long data is considered "fresh":
 *  - CRITICAL: dashboard KPIs, pipeline, tickets — refreshed aggressively
 *  - STANDARD: contacts, events, campaigns — balanced
 *  - BACKGROUND: logs, settings, audit data — long-lived
 *
 * gcTime (garbage-collect time) controls how long *unused* cache entries
 * are kept in memory before being evicted.
 */

/** staleTime values (ms) */
export const STALE = {
  /** 30 s — real-time-sensitive KPIs */
  CRITICAL: 1000 * 30,
  /** 60 s — default for most queries */
  STANDARD: 1000 * 60,
  /** 5 min — rarely-changing data (settings, logs, stages) */
  BACKGROUND: 1000 * 60 * 5,
} as const;

/** gcTime values (ms) */
export const GC = {
  /** 5 min — keep critical data around briefly */
  SHORT: 1000 * 60 * 5,
  /** 15 min — default */
  MEDIUM: 1000 * 60 * 15,
  /** 30 min — background data can linger */
  LONG: 1000 * 60 * 30,
} as const;

/**
 * Predefined option presets for useQuery.
 * Usage:
 *   useQuery({ queryKey: [...], queryFn: ..., ...QUERY_PRESETS.critical })
 */
export const QUERY_PRESETS = {
  critical: { staleTime: STALE.CRITICAL, gcTime: GC.SHORT },
  standard: { staleTime: STALE.STANDARD, gcTime: GC.MEDIUM },
  background: { staleTime: STALE.BACKGROUND, gcTime: GC.LONG },
} as const;

/**
 * Keys that should be persisted to localStorage for instant load.
 * Only stable, non-sensitive data should be listed here.
 */
export const PERSISTABLE_QUERY_KEYS = [
  'pipeline-stages',
  'tags',
  'products',
  'marketing-campaigns',
  'brands',
] as const;

/**
 * Query keys that should be prefetched after login for a given brand.
 */
export const PREFETCH_KEYS = [
  'dashboard-leads-today',
  'dashboard-open-deals',
  'dashboard-open-tickets',
  'dashboard-total-contacts',
  'dashboard-appointments-today',
  'pipeline-stages',
  'contacts',
  'deals',
] as const;
