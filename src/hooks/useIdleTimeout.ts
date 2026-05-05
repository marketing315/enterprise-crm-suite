/**
 * A9 — Idle session timeout.
 *
 * Tracks user activity (mouse, keyboard, touch, visibility) and triggers
 * a warning before forcing signOut after a configurable idle window.
 *
 * - Default: 30 min user, 15 min admin/CEO
 * - Warning: 60s prima della scadenza
 * - Cross-tab: BroadcastChannel sincronizza l'attività fra schede
 * - Audit: emette `idle_timeout` su session_audit prima del signOut
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logSessionEvent } from "@/lib/session-audit";
import { getStoredIdleActivity, markIdleActivity } from "@/lib/idle-activity";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "visibilitychange",
] as const;

const CHANNEL_NAME = "ralph-idle-activity";

export interface UseIdleTimeoutOptions {
  enabled: boolean;
  /** Minuti di inattività prima del logout */
  idleMinutes: number;
  /** Secondi di warning prima della scadenza */
  warningSeconds: number;
  onTimeout: () => void | Promise<void>;
}

export interface IdleTimeoutState {
  warning: boolean;
  /** Secondi rimanenti durante il warning (0 quando non in warning) */
  secondsRemaining: number;
  /** Resetta manualmente il timer (es. click "Resta connesso") */
  extend: () => void;
}

export function useIdleTimeout(opts: UseIdleTimeoutOptions): IdleTimeoutState {
  const { enabled, idleMinutes, warningSeconds, onTimeout } = opts;
  const [warning, setWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const intervalRef = useRef<number | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const firedRef = useRef(false);

  const broadcastActivity = useCallback((ts: number) => {
    try {
      channelRef.current?.postMessage({ type: "activity", ts });
    } catch {
      // ignore
    }
    markIdleActivity(ts);
  }, []);

  const recordActivity = useCallback(
    (broadcast = true) => {
      const now = Date.now();
      lastActivityRef.current = now;
      firedRef.current = false;
      setWarning(false);
      setSecondsRemaining(0);
      if (broadcast) broadcastActivity(now);
    },
    [broadcastActivity],
  );

  const extend = useCallback(() => {
    recordActivity(true);
  }, [recordActivity]);

  useEffect(() => {
    if (!enabled) return;

    // Init last activity from storage (cross-tab continuity)
    lastActivityRef.current = getStoredIdleActivity() ?? Date.now();

    // BroadcastChannel for cross-tab sync (graceful fallback if unavailable)
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const ch = new BroadcastChannel(CHANNEL_NAME);
        ch.onmessage = (ev) => {
          const data = ev.data as { type?: string; ts?: number } | null;
          if (data?.type === "activity" && typeof data.ts === "number") {
            lastActivityRef.current = Math.max(lastActivityRef.current, data.ts);
            firedRef.current = false;
            setWarning(false);
            setSecondsRemaining(0);
          }
        };
        channelRef.current = ch;
      } catch {
        channelRef.current = null;
      }
    }

    const onActivity = () => {
      // Skip visibility events when becoming hidden — only count "becoming visible"
      // Generic handler is fine: just resets timer on any signal.
      recordActivity(true);
    };

    ACTIVITY_EVENTS.forEach((evt) => {
      window.addEventListener(evt, onActivity, { passive: true });
    });

    const idleMs = Math.max(1, idleMinutes) * 60_000;
    const warnMs = Math.max(5, warningSeconds) * 1000;

    const tick = () => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = idleMs - elapsed;

      if (remaining <= 0) {
        if (firedRef.current) return;
        firedRef.current = true;
        setWarning(false);
        setSecondsRemaining(0);
        // Fire-and-forget audit, then logout
        void (async () => {
          try {
            await logSessionEvent("idle_timeout", {
              metadata: { idle_minutes: idleMinutes },
            });
          } catch {
            // ignore
          }
          try {
            await onTimeout();
          } catch (err) {
            console.warn("[idle-timeout] onTimeout failed", err);
          }
        })();
        return;
      }

      if (remaining <= warnMs) {
        setWarning(true);
        setSecondsRemaining(Math.ceil(remaining / 1000));
      } else if (warning) {
        setWarning(false);
        setSecondsRemaining(0);
      }
    };

    intervalRef.current = window.setInterval(tick, 1000);
    tick();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => {
        window.removeEventListener(evt, onActivity);
      });
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      try {
        channelRef.current?.close();
      } catch {
        // ignore
      }
      channelRef.current = null;
    };
    // We intentionally exclude `warning` to keep the listeners stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idleMinutes, warningSeconds, onTimeout, recordActivity]);

  return { warning, secondsRemaining, extend };
}
