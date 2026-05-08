/**
 * MFA Trusted Device — "ricorda questo dispositivo per N giorni".
 *
 * Genera un token random in localStorage (per-browser, per-utente). L'hash
 * SHA-256 viene salvato server-side via `register_mfa_trusted_device`.
 * Al login successivo, prima di mostrare la challenge MFA, controlliamo
 * via `check_mfa_trusted_device` se il token esiste e non è scaduto.
 *
 * Il token in chiaro NON lascia mai questo dispositivo: solo l'hash va al server.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "ralph.mfa-trusted-device:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function randomToken(): string {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getLocalTrustedToken(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

export function clearLocalTrustedToken(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}

/**
 * Verifica se questo dispositivo è "fidato" per l'utente corrente.
 * Da chiamare PRIMA di redirigere alla challenge MFA.
 */
export async function isDeviceTrusted(userId: string): Promise<boolean> {
  const token = getLocalTrustedToken(userId);
  if (!token) return false;
  try {
    const hash = await sha256Hex(token);
    const { data, error } = await supabase.rpc("check_mfa_trusted_device", {
      _token_hash: hash,
    });
    if (error) {
      console.warn("[mfa-trusted-device] check failed", error.message);
      return false;
    }
    if (!data) {
      // Token presente lato client ma non valido lato server: pulisci.
      clearLocalTrustedToken(userId);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[mfa-trusted-device] check exception", e);
    return false;
  }
}

/**
 * Registra il dispositivo come fidato dopo MFA verify success.
 */
export async function registerTrustedDevice(
  userId: string,
  opts: { days?: number; label?: string } = {},
): Promise<boolean> {
  try {
    const token = randomToken();
    const hash = await sha256Hex(token);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
    const { error } = await supabase.rpc("register_mfa_trusted_device", {
      _token_hash: hash,
      _label: opts.label ?? null,
      _user_agent: ua,
      _days: opts.days ?? 30,
    });
    if (error) {
      console.warn("[mfa-trusted-device] register failed", error.message);
      return false;
    }
    localStorage.setItem(storageKey(userId), token);
    return true;
  } catch (e) {
    console.warn("[mfa-trusted-device] register exception", e);
    return false;
  }
}
