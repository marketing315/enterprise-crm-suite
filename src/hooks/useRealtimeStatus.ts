import { useSyncExternalStore } from 'react';

/**
 * Lightweight global store that tracks the health of every realtime channel
 * subscribed via `useGlobalRealtime`. Components can read the aggregated
 * status with the `useRealtimeStatus` hook and display banners/badges.
 */
export type ChannelStatus = 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface ChannelState {
  status: ChannelStatus;
  retryCount: number;
  lastError?: string;
  lastChangeAt: number;
}

type Listener = () => void;

const channels = new Map<string, ChannelState>();
const listeners = new Set<Listener>();

/**
 * Telemetry counters for SLO monitoring of realtime resilience.
 * In-memory, reset on page reload. Read via realtimeStatusStore.getTelemetry().
 */
export interface RealtimeTelemetry {
  totalErrors: number;
  totalReconnects: number;
  totalSubscribes: number;
  fallbackPollingActivations: number;
  lastErrorAt: number | null;
  lastReconnectAt: number | null;
  lastFallbackAt: number | null;
  errorsPerChannel: Record<string, number>;
  startedAt: number;
}

const telemetry: RealtimeTelemetry = {
  totalErrors: 0,
  totalReconnects: 0,
  totalSubscribes: 0,
  fallbackPollingActivations: 0,
  lastErrorAt: null,
  lastReconnectAt: null,
  lastFallbackAt: null,
  errorsPerChannel: {},
  startedAt: Date.now(),
};

function emit() {
  for (const l of listeners) l();
}

export const realtimeStatusStore = {
  set(channelName: string, patch: Partial<ChannelState>) {
    const prev = channels.get(channelName) ?? {
      status: 'connecting' as ChannelStatus,
      retryCount: 0,
      lastChangeAt: Date.now(),
    };
    channels.set(channelName, {
      ...prev,
      ...patch,
      lastChangeAt: Date.now(),
    });

    // Telemetry side-effects
    if (patch.status === 'connected' && prev.status !== 'connected') {
      telemetry.totalSubscribes += 1;
      if (prev.status === 'reconnecting' || prev.status === 'error') {
        telemetry.totalReconnects += 1;
        telemetry.lastReconnectAt = Date.now();
      }
    }
    if (patch.status === 'error' && prev.status !== 'error') {
      telemetry.totalErrors += 1;
      telemetry.lastErrorAt = Date.now();
      telemetry.errorsPerChannel[channelName] =
        (telemetry.errorsPerChannel[channelName] ?? 0) + 1;
    }
    emit();
  },
  remove(channelName: string) {
    channels.delete(channelName);
    emit();
  },
  reset() {
    channels.clear();
    emit();
  },
  recordFallbackActivation() {
    telemetry.fallbackPollingActivations += 1;
    telemetry.lastFallbackAt = Date.now();
    emit();
  },
  getTelemetry(): Readonly<RealtimeTelemetry> {
    return { ...telemetry, errorsPerChannel: { ...telemetry.errorsPerChannel } };
  },
  snapshot(): ReadonlyMap<string, ChannelState> {
    return channels;
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export interface RealtimeAggregateStatus {
  overall: 'connected' | 'connecting' | 'degraded' | 'disconnected';
  totalChannels: number;
  connectedChannels: number;
  failingChannels: { name: string; state: ChannelState }[];
  maxRetryCount: number;
}

let cachedSnapshotKey = '';
let cachedAggregate: RealtimeAggregateStatus = {
  overall: 'connecting',
  totalChannels: 0,
  connectedChannels: 0,
  failingChannels: [],
  maxRetryCount: 0,
};

function getAggregate(): RealtimeAggregateStatus {
  // Build a cheap fingerprint to keep referential stability for React
  const entries = Array.from(channels.entries());
  const key = entries
    .map(([n, s]) => `${n}:${s.status}:${s.retryCount}`)
    .sort()
    .join('|');

  if (key === cachedSnapshotKey) return cachedAggregate;
  cachedSnapshotKey = key;

  const failing = entries.filter(
    ([, s]) => s.status === 'error' || s.status === 'reconnecting',
  );
  const connected = entries.filter(([, s]) => s.status === 'connected').length;
  const total = entries.length;
  const maxRetry = entries.reduce((m, [, s]) => Math.max(m, s.retryCount), 0);

  let overall: RealtimeAggregateStatus['overall'];
  if (total === 0) overall = 'connecting';
  else if (connected === total) overall = 'connected';
  else if (connected === 0) overall = 'disconnected';
  else if (failing.length > 0) overall = 'degraded';
  else overall = 'connecting';

  cachedAggregate = {
    overall,
    totalChannels: total,
    connectedChannels: connected,
    failingChannels: failing.map(([name, state]) => ({ name, state })),
    maxRetryCount: maxRetry,
  };
  return cachedAggregate;
}

export function useRealtimeStatus(): RealtimeAggregateStatus {
  return useSyncExternalStore(
    (l) => realtimeStatusStore.subscribe(l),
    getAggregate,
    getAggregate,
  );
}
