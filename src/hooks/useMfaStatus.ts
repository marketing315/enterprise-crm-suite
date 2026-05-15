import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MfaStatus = {
  loading: boolean;
  /** True if at least one verified TOTP factor exists */
  enrolled: boolean;
  /** AAL of current session: 'aal1' or 'aal2' */
  currentLevel: "aal1" | "aal2" | null;
  /** AAL required by the user's factors (aal2 if any verified factor exists) */
  nextLevel: "aal1" | "aal2" | null;
  /** True if user has enrolled MFA but has not completed the AAL2 challenge */
  needsChallenge: boolean;
  /** Verified TOTP factors */
  factors: Array<{ id: string; friendly_name?: string | null; created_at: string }>;
  refresh: () => Promise<void>;
};

/**
 * A5 — reads the user's MFA enrollment + AAL state from Supabase Auth.
 * Pure read, no side effects on the session.
 */
export function useMfaStatus(): MfaStatus {
  const [loading, setLoading] = useState(true);
  const [enrolled, setEnrolled] = useState(false);
  const [currentLevel, setCurrentLevel] = useState<"aal1" | "aal2" | null>(null);
  const [nextLevel, setNextLevel] = useState<"aal1" | "aal2" | null>(null);
  const [factors, setFactors] = useState<MfaStatus["factors"]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: aal }, { data: factorList }, { data: userData }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
        supabase.auth.getUser(),
      ]);
      // Fallback: listFactors() può ritornare vuoto anche se il factor esiste
      // server-side. getUser().factors è la fonte di verità.
      const fromList = (factorList?.totp ?? []).filter((f) => f.status === "verified");
      const fromUser = ((userData?.user as unknown as { factors?: Array<{ id: string; status: string; factor_type: string; friendly_name?: string | null; created_at: string }> })?.factors ?? [])
        .filter((f) => f.factor_type === "totp" && f.status === "verified");
      const totpVerified = fromList.length > 0 ? fromList : fromUser;
      setFactors(
        totpVerified.map((f) => ({
          id: f.id,
          friendly_name: f.friendly_name ?? null,
          created_at: f.created_at,
        })),
      );
      setEnrolled(totpVerified.length > 0);
      setCurrentLevel((aal?.currentLevel as "aal1" | "aal2" | null) ?? null);
      setNextLevel((aal?.nextLevel as "aal1" | "aal2" | null) ?? null);
    } catch (e) {
      console.warn("[useMfaStatus] load failed:", e);
      setEnrolled(false);
      setFactors([]);
      setCurrentLevel(null);
      setNextLevel(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED" ||
        event === "MFA_CHALLENGE_VERIFIED"
      ) {
        void load();
      }
      if (event === "SIGNED_OUT") {
        setEnrolled(false);
        setFactors([]);
        setCurrentLevel(null);
        setNextLevel(null);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [load]);

  const needsChallenge =
    enrolled && nextLevel === "aal2" && currentLevel === "aal1";

  return {
    loading,
    enrolled,
    currentLevel,
    nextLevel,
    needsChallenge,
    factors,
    refresh: load,
  };
}
