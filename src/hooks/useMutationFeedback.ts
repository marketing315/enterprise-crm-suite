import { useCallback } from "react";
import { toast } from "sonner";

interface FeedbackOptions {
  /** Titolo mostrato al successo */
  successTitle?: string;
  /** Descrizione opzionale al successo */
  successDescription?: string;
  /** Prefisso del titolo errore (default: "Operazione non riuscita") */
  errorTitle?: string;
  /** Override dei messaggi noti (es. STALE_DEAL → "Aggiorna pagina") */
  errorMap?: Record<string, string>;
}

const DEFAULT_ERROR_MAP: Record<string, string> = {
  STALE_DEAL: "Il deal è stato modificato da un altro utente. Aggiorno la lista.",
  STALE_TICKET: "Il ticket è stato modificato da un altro utente. Aggiorno la lista.",
  forbidden: "Non hai i permessi per questa operazione.",
  rate_limited: "Troppe richieste, riprova tra qualche secondo.",
};

/**
 * Helper Sprint 6: feedback toast standardizzato per mutation.
 *
 *   const fb = useMutationFeedback({ successTitle: "Salvato" });
 *   mutation.mutate(payload, { onSuccess: fb.success, onError: fb.error });
 */
export function useMutationFeedback(opts: FeedbackOptions = {}) {
  const success = useCallback(
    (overrideTitle?: string) => {
      toast.success(overrideTitle ?? opts.successTitle ?? "Operazione completata", {
        description: opts.successDescription,
      });
    },
    [opts.successTitle, opts.successDescription],
  );

  const error = useCallback(
    (err: unknown) => {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      const mapped =
        opts.errorMap?.[raw] ??
        DEFAULT_ERROR_MAP[raw] ??
        DEFAULT_ERROR_MAP[raw.split(":")[0] ?? ""] ??
        (raw || "Errore sconosciuto");
      toast.error(opts.errorTitle ?? "Operazione non riuscita", {
        description: mapped,
      });
    },
    [opts.errorMap, opts.errorTitle],
  );

  return { success, error };
}
