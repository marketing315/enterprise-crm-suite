/**
 * F1.bis — Preferenza utente per disattivare l'idle-timeout di sessione.
 *
 * Persistita in localStorage (per-device): l'utente potrebbe voler restare
 * loggato sul proprio device personale ma mantenere il timeout su una
 * postazione condivisa. Default: attivo.
 *
 * NB: la disattivazione resta una scelta consapevole dell'utente — i log
 * di audit (`session_audit`) registrano comunque login/logout/MFA.
 */

const KEY = "ralph.idle-timeout.enabled";

export function getIdleTimeoutEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) return true; // default ON
    return raw !== "false";
  } catch {
    return true;
  }
}

export function setIdleTimeoutEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, enabled ? "true" : "false");
    // Notifica le finestre/tab per aggiornare il watcher senza reload
    window.dispatchEvent(new CustomEvent("ralph:idle-timeout-pref", { detail: { enabled } }));
  } catch {
    /* ignore */
  }
}

export const IDLE_TIMEOUT_PREF_EVENT = "ralph:idle-timeout-pref";
