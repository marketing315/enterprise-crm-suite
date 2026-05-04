import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const PREF_TYPE = "sound_critical";

/**
 * Critical notification types that should play a sound when received
 * (only when soundEnabled is true and the user has interacted with the page).
 */
export const CRITICAL_NOTIFICATION_TYPES = new Set<string>([
  "ticket_created",
  "ticket_escalated",
  "appointment_risk_alert",
  "slo_alert",
  "payment_overdue",
]);

/**
 * Plays two short beeps via WebAudio (no asset needed).
 * Silently no-ops on browsers that block autoplay before user gesture.
 */
function playBeep() {
  try {
    const AudioCtx =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const beep = (freq: number, start: number, dur = 0.12) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    beep(880, 0);
    beep(660, 0.16);

    // Auto-close context shortly after to free resources
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    // Browser autoplay policy or unsupported — ignore
  }
}

export function useNotificationSound() {
  const { user } = useAuth();
  const userId = user?.id;
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(false);
  const loadedRef = useRef(false);

  // Load preference
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_push_preferences")
        .select("enabled")
        .eq("user_id", userId)
        .eq("notification_type", PREF_TYPE)
        .maybeSingle();
      if (cancelled) return;
      // Default: ON (so users hear SLA alerts immediately)
      setSoundEnabledState(data?.enabled ?? true);
      loadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setSoundEnabled = useCallback(
    async (next: boolean) => {
      setSoundEnabledState(next);
      if (!userId) return;
      await supabase.from("user_push_preferences").upsert(
        {
          user_id: userId,
          notification_type: PREF_TYPE,
          enabled: next,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,notification_type" }
      );
    },
    [userId]
  );

  const playSound = useCallback(() => {
    if (!soundEnabled) return;
    playBeep();
  }, [soundEnabled]);

  return { soundEnabled, setSoundEnabled, playSound };
}
