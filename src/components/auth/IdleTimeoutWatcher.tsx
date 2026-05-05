/**
 * A9 — Idle timeout watcher mounted inside MainLayout.
 *
 * Soglia: 15 min admin/CEO, 30 min utenti standard.
 * Mostra un AlertDialog 60s prima del logout con bottone "Resta connesso".
 */
import { useCallback } from "react";
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

const WARNING_SECONDS = 60;

export function IdleTimeoutWatcher() {
  const { session, isAdmin, isCeo, signOut } = useAuth();

  const enabled = !!session;
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
