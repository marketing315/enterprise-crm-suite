/**
 * A9 — Idle timeout watcher mounted inside MainLayout.
 *
 * Soglia: 15 min admin/CEO, 30 min utenti standard.
 * Mostra un AlertDialog 60s prima del logout con bottone "Resta connesso".
 */
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getIdleTimeoutEnabled, IDLE_TIMEOUT_PREF_EVENT } from "@/lib/idle-timeout-pref";
import { isDeviceTrusted } from "@/lib/mfa-trusted-device";

const WARNING_SECONDS = 60;

export function IdleTimeoutWatcher() {
  const { session, isAdmin, isCeo, supabaseUser, signOut } = useAuth();
  const [prefEnabled, setPrefEnabled] = useState<boolean>(() => getIdleTimeoutEnabled());
  const [deviceTrusted, setDeviceTrusted] = useState<boolean>(false);

  useEffect(() => {
    const onPref = (ev: Event) => {
      const detail = (ev as CustomEvent<{ enabled: boolean }>).detail;
      setPrefEnabled(detail?.enabled ?? getIdleTimeoutEnabled());
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === "ralph.idle-timeout.enabled") setPrefEnabled(getIdleTimeoutEnabled());
    };
    window.addEventListener(IDLE_TIMEOUT_PREF_EVENT, onPref);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(IDLE_TIMEOUT_PREF_EVENT, onPref);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Verifica se questo browser è registrato come "trusted device" per l'utente.
  // Se sì, anche admin/CEO possono disattivare l'idle timeout (parità con la
  // scelta consapevole fatta in MfaChallenge: "fidati di questo dispositivo per 30gg").
  useEffect(() => {
    let cancelled = false;
    const uid = supabaseUser?.id;
    if (!uid) {
      setDeviceTrusted(false);
      return;
    }
    void isDeviceTrusted(uid).then((ok) => {
      if (!cancelled) setDeviceTrusted(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [supabaseUser?.id]);

  // Admin/CEO non possono disattivarlo (compliance audit F) — TRANNE se il
  // dispositivo è stato esplicitamente registrato come trusted (MFA 30gg).
  const canDisable = !(isAdmin || isCeo) || deviceTrusted;

  const enabled = !!session && (canDisable ? prefEnabled : true);
  const idleMinutes = 60;

  const handleTimeout = useCallback(async () => {
    await signOut();
  }, [signOut]);

  const { warning, secondsRemaining, extend } = useIdleTimeout({
    enabled,
    idleMinutes,
    warningSeconds: WARNING_SECONDS,
    onTimeout: handleTimeout,
  });

  if (!enabled) return null;

  return (
    <AlertDialog open={warning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Sei ancora qui?</AlertDialogTitle>
          <AlertDialogDescription>
            Per sicurezza la sessione verrà chiusa automaticamente fra{" "}
            <strong>{secondsRemaining}s</strong> per inattività.
            Clicca "Resta connesso" per continuare a lavorare.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => void signOut()}>
            Esci ora
          </AlertDialogCancel>
          <AlertDialogAction onClick={extend}>
            Resta connesso
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
