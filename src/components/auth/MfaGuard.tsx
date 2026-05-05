import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useMfaStatus } from "@/hooks/useMfaStatus";

/**
 * A5 — enforce MFA for admin/CEO globally on protected routes:
 *   - admin/ceo without enrolled factor → /security/mfa-enroll
 *   - any user with verified factor at AAL1 → /security/mfa-challenge
 * Other users pass through.
 *
 * Whitelisted paths (login, MFA flows, password reset) are exempt and
 * must be handled at routing level (this guard sits inside the
 * authenticated tree).
 */
export function MfaGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, isCeo, isLoading } = useAuth();
  const { loading, enrolled, needsChallenge } = useMfaStatus();
  const location = useLocation();

  // Allow MFA flow pages themselves through
  if (location.pathname.startsWith("/security/mfa-")) {
    return <>{children}</>;
  }

  if (isLoading || loading) return null;

  const next = encodeURIComponent(location.pathname + location.search);

  // Already enrolled but session is AAL1 → must challenge
  if (needsChallenge) {
    return <Navigate to={`/security/mfa-challenge?next=${next}`} replace />;
  }

  // Admin/CEO must enroll if they don't have a factor yet
  if ((isAdmin || isCeo) && !enrolled) {
    return <Navigate to={`/security/mfa-enroll?next=${next}`} replace />;
  }

  return <>{children}</>;
}
