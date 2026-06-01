import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMfaStatus } from "@/hooks/useMfaStatus";
import { isDeviceTrusted } from "@/lib/mfa-trusted-device";
import { isBiometricAal2Trusted } from "@/lib/biometric/client";

/**
 * A5 — enforce MFA for admin/CEO globally on protected routes:
 *   - admin/ceo without enrolled factor → /security/mfa-enroll
 *   - any user with verified factor at AAL1 → /security/mfa-challenge
 *     UNLESS this browser is registered as "trusted device" for the user.
 */
export function MfaGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isCeo, isLoading, supabaseUser } = useAuth();
  const { loading, enrolled, needsChallenge } = useMfaStatus();
  const location = useLocation();

  // null = ancora da verificare, true/false = esito
  const [trusted, setTrusted] = useState<boolean | null>(null);

  // BUGFIX: usiamo supabaseUser.id (auth.users.id) — non user.id (public.users.id).
  // MfaChallenge registra il trusted device con l'auth uid via
  // sessionData.session.user.id; usare l'internal user id qui causava un mismatch
  // della chiave localStorage e il check ritornava sempre false, costringendo
  // l'utente a ri-verificare MFA a ogni login.
  const authUid = supabaseUser?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!needsChallenge || !authUid) {
      setTrusted(null);
      return;
    }
    setTrusted(null);
    void (async () => {
      // Accettiamo come "trusted" sia il classico grant TOTP che il grant biometrico.
      const [totpOk, bioOk] = await Promise.all([
        isDeviceTrusted(authUid),
        isBiometricAal2Trusted(authUid),
      ]);
      if (!cancelled) setTrusted(totpOk || bioOk);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsChallenge, authUid]);

  // Allow MFA flow pages themselves through
  if (location.pathname.startsWith("/security/mfa-")) {
    return <>{children}</>;
  }

  if (isLoading || loading) return null;

  const next = encodeURIComponent(location.pathname + location.search);

  if (needsChallenge) {
    // Aspetta l'esito del check trusted device prima di redirigere.
    if (trusted === null) return null;
    if (!trusted) {
      return <Navigate to={`/security/mfa-challenge?next=${next}`} replace />;
    }
    // dispositivo fidato → bypass challenge
  }

  // Admin/CEO must enroll if they don't have a factor yet
  if ((isAdmin || isCeo) && !enrolled) {
    return <Navigate to={`/security/mfa-enroll?next=${next}`} replace />;
  }

  return <>{children}</>;
}
