import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { markIdleActivity } from "@/lib/idle-activity";

const MFA_READY_TIMEOUT_MS = 6000;

async function waitForAal2(timeoutMs = MFA_READY_TIMEOUT_MS): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [{ data: sessionData }, { data: aal }] = await Promise.all([
      supabase.auth.getSession(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    const aalFromToken = sessionData.session?.user?.aal;
    if (aal?.currentLevel === "aal2" || aalFromToken === "aal2") return true;
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

/**
 * A5 — TOTP challenge after sign-in for users who already enrolled MFA.
 * The session stays at AAL1 until the 6-digit code is verified.
 */
export default function MfaChallenge() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [factorId, setFactorId] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // BUGFIX: se la session è già aal2 (es. doppio mount React StrictMode
        // o navigazione tornata indietro), non creare una nuova challenge:
        // ne rigenererebbe una che revoca il token corrente.
        const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aal?.currentLevel === "aal2") {
          navigate(next, { replace: true });
          return;
        }
        const { data: list, error } = await supabase.auth.mfa.listFactors();
        if (error || cancelled) return;
        const verified = (list?.totp ?? []).find((f) => f.status === "verified");
        if (!verified) {
          // No factor → enroll instead
          navigate(`/security/mfa-enroll?next=${encodeURIComponent(next)}`, { replace: true });
          return;
        }
        const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
          factorId: verified.id,
        });
        if (chErr || !ch || cancelled) {
          if (chErr) toast.error(chErr.message);
          return;
        }
        setFactorId(verified.id);
        setChallengeId(ch.id);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, next]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!factorId || !challengeId || code.length !== 6) return;
    setVerifying(true);
    try {
      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId,
        code,
      });
      if (error) {
        toast.error(error.message || "Codice non valido");
        setCode("");
        // A6: audit failed challenge
        void import("@/lib/session-audit").then(({ logSessionEvent }) =>
          logSessionEvent("mfa_challenge_failed"),
        );
        return;
      }
      // A6: audit successful challenge
      void import("@/lib/session-audit").then(({ logSessionEvent }) =>
        logSessionEvent("mfa_challenge_success"),
      );

      markIdleActivity();
      const ready = await waitForAal2();
      if (!ready) {
        toast.error("Verifica MFA riuscita, ma la sessione non è ancora pronta. Riprova fra qualche secondo.");
        return;
      }

      toast.success("Verifica MFA completata");
      navigate(next, { replace: true });
    } finally {
      setVerifying(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-1">
          <ShieldCheck className="mx-auto h-10 w-10 text-primary mb-2" />
          <CardTitle className="text-2xl font-bold">Verifica MFA</CardTitle>
          <CardDescription>
            Inserisci il codice a 6 cifre dalla tua app di autenticazione per
            completare l'accesso.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleVerify}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="otp">Codice TOTP</Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoComplete="one-time-code"
                autoFocus
                required
                disabled={verifying}
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button type="submit" className="w-full" disabled={verifying || code.length !== 6}>
              {verifying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifica…
                </>
              ) : (
                "Conferma"
              )}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={handleSignOut}>
              Annulla e esci
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
