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

const WARNING_SECONDS = 60;

export function IdleTimeoutWatcher() {
  const { session, isAdmin, isCeo, signOut } = useAuth();
  const [prefEnabled, setPrefEnabled] = useState<boolean>(() => getIdleTimeoutEnabled());

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

  // Admin/CEO non possono disattivarlo (compliance audit F): forziamo enabled=true.
  const canDisable = !(isAdmin || isCeo);
  const enabled = !!session && (canDisable ? prefEnabled : true);
  const idleMinutes = isAdmin || isCeo ? 15 : 30;

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
