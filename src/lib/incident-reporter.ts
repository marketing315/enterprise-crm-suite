/**
 * F6 — Frontend incident reporter
 *
 * Invia gli errori catturati dagli ErrorBoundary di produzione al backend
 * tramite l'RPC `report_client_incident`. Tutto best-effort: nessun errore
 * di rete deve mai propagarsi all'app (silenzia su fallimento).
 *
 * - Dedup locale per finestre di 5s (stessa firma → un solo report)
 * - Skippato in DEV (per non inquinare la tabella)
 * - Rate-limit lato server (30/h utente) gestisce abusi.
 */
import { supabase } from "@/integrations/supabase/client";

type IncidentInput = {
  errorId: string;
  error: Error;
  componentStack?: string;
  boundaryLabel?: string;
};

const seen = new Map<string, number>();
const DEDUP_WINDOW_MS = 5_000;

function digest(input: string): string {
  // Hash lightweight (FNV-1a 32-bit) — sufficiente per fingerprint stack.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function getBuildVersion(): string | undefined {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_BUILD_VERSION;
    return v || undefined;
  } catch {
    return undefined;
  }
}

export async function reportClientIncident(input: IncidentInput): Promise<void> {
  // Skip in dev: non vogliamo rumore in tabella durante lo sviluppo.
  if (import.meta.env.DEV) return;

  try {
    const stackPart = (input.componentStack ?? input.error.stack ?? "").slice(0, 2000);
    const sig = `${input.boundaryLabel ?? ""}::${input.error.message ?? ""}::${digest(stackPart)}`;
    const now = Date.now();
    const last = seen.get(sig);
    if (last && now - last < DEDUP_WINDOW_MS) return;
    seen.set(sig, now);
    // Pulizia opportunistica
    if (seen.size > 50) {
      for (const [k, t] of seen) {
        if (now - t > DEDUP_WINDOW_MS) seen.delete(k);
      }
    }

    await supabase.rpc("report_client_incident" as never, {
      p_error_id: input.errorId,
      p_route: typeof window !== "undefined" ? window.location.pathname : null,
      p_boundary_label: input.boundaryLabel ?? null,
      p_message: (input.error.message ?? "").slice(0, 500),
      p_stack_digest: digest(stackPart),
      p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
      p_build_version: getBuildVersion() ?? null,
      p_metadata: { name: input.error.name ?? null },
    } as never);
  } catch {
    /* swallow: reporting non deve mai rompere l'app */
  }
}
