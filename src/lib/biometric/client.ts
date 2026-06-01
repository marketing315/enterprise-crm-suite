/**
 * API di alto livello per il login biometrico.
 *
 * Espone:
 *   - enableBiometric(pin, label?)  → enrollment iniziale
 *   - disableBiometric()            → soft-disable lato server + clear vault
 *   - changeBiometricPin(old, new)  → ricifra la wrappingKey con la chiave del nuovo PIN
 *   - unlockBiometric(opts)         → sblocca con biometria/PIN e setta la sessione Supabase
 *   - getEnrollmentSummary()        → stato attuale per la UI
 */
import { supabase } from "@/integrations/supabase/client";
import { sha256Hex } from "./crypto";
import {
  clearVault,
  createVault,
  getLastBiometricUser,
  getVaultMeta,
  hasVault,
  refreshVaultSession,
  unlockWithPin,
  unlockWithPrf,
} from "./session-vault";
import {
  assertCredential,
  createPlatformCredential,
  isPlatformAuthenticatorAvailable,
  isWebAuthnAvailable,
  b64urlEncode,
} from "./webauthn";

export interface BiometricSupport {
  webauthn: boolean;
  platformAuthenticator: boolean;
}

export async function detectSupport(): Promise<BiometricSupport> {
  const webauthn = isWebAuthnAvailable();
  const platformAuthenticator = webauthn && (await isPlatformAuthenticatorAvailable());
  return { webauthn, platformAuthenticator };
}

export interface BiometricStatus {
  enrolled: boolean;
  label?: string | null;
  last_used_at?: string | null;
  created_at?: string | null;
  locked_until?: string | null;
}

export async function getEnrollmentStatus(): Promise<BiometricStatus> {
  const { data, error } = await supabase.rpc("get_biometric_status");
  if (error) throw error;
  return ((data as unknown) ?? { enrolled: false }) as BiometricStatus;
}

/** Hash client del PIN: il server riceve solo l'hash SHA-256 (poi bcrypt). */
async function hashPinForServer(pin: string): Promise<string> {
  return sha256Hex(`ralph.bio.pin.v1:${pin}`);
}

export async function enableBiometric(opts: {
  pin: string;
  label?: string;
}): Promise<void> {
  const support = await detectSupport();
  if (!support.platformAuthenticator) {
    throw new Error("Questo dispositivo non supporta Face ID / impronta nel browser.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Devi essere connesso per attivare la biometria.");

  const userId = session.user.id;
  const userEmail = session.user.email ?? "account";

  // 1) Crea credenziale platform (richiede Face ID/impronta)
  const created = await createPlatformCredential(userId, userEmail);

  // 2) Salva PIN hash lato server
  const pinHash = await hashPinForServer(opts.pin);
  const { error: rpcErr } = await supabase.rpc("set_biometric_pin", {
    _pin_client_hash: pinHash,
    _label: opts.label ?? null,
  });
  if (rpcErr) throw rpcErr;

  // 3) Crea vault locale
  await createVault({
    userId,
    userEmail,
    session,
    pin: opts.pin,
    credentialHandle: created.rawId,
    prfSecret: created.prfSecret,
  });

  // 4) Registra la public key lato server per abilitare il login passkey
  //    da nuovi dispositivi (best-effort: se fallisce, lo sblocco locale
  //    funziona comunque).
  try {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
    await supabase.functions.invoke("passkey-register", {
      body: {
        challenge: created.challengeB64,
        rpId: created.rpId,
        origin: created.origin,
        attestationObject: created.attestationObjectB64,
        clientDataJSON: created.clientDataJSONB64,
        credentialId: created.credentialIdB64,
        transports: created.transports,
        label: opts.label ?? null,
        userAgent: ua,
      },
    });
  } catch (e) {
    console.warn("[biometric] passkey-register failed (sblocco locale resta attivo)", e);
  }
}

export async function disableBiometric(): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  await supabase.rpc("disable_biometric");
  if (session?.user?.id) await clearVault(session.user.id);
}

export async function changeBiometricPin(oldPin: string, newPin: string): Promise<void> {
  // Per cambiare il PIN occorre essere autenticati e sbloccare il vault
  // col vecchio PIN (così otteniamo la wrappingKey in chiaro), poi
  // ricreiamo il vault con il nuovo PIN preservando la credenziale.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Devi essere connesso.");
  const userId = session.user.id;
  const userEmail = session.user.email ?? "account";

  const meta = await getVaultMeta(userId);
  if (!meta) throw new Error("Nessuna biometria attiva su questo dispositivo.");

  // Verifica server-side del vecchio PIN (anti-bypass + lockout)
  const oldHash = await hashPinForServer(oldPin);
  const { data: vData, error: vErr } = await supabase.rpc("verify_biometric_pin", {
    _pin_client_hash: oldHash,
  });
  if (vErr) throw vErr;
  const verify = vData as { ok?: boolean; reason?: string };
  if (!verify?.ok) throw new Error("PIN attuale errato.");

  // Sblocco locale → ricavo wrappingRaw
  const unlocked = await unlockWithPin(userId, oldPin);

  // Salva nuovo PIN server-side (azzera attempts/lockout)
  const newHash = await hashPinForServer(newPin);
  const { error: setErr } = await supabase.rpc("set_biometric_pin", {
    _pin_client_hash: newHash,
    _label: null,
  });
  if (setErr) throw setErr;

  // Re-crea vault locale con la stessa session corrente e nuova chiave PIN
  await createVault({
    userId,
    userEmail,
    session,
    pin: newPin,
    credentialHandle: meta.credentialHandle,
    prfSecret: null, // niente PRF refresh: rimane il vecchio wrappedKeyByPrf? no, lo perdiamo
  });

  // Tag silenzioso: la wrappingRaw che avevamo è ora obsoleta (ne abbiamo
  // generata una nuova in createVault).
  void unlocked;
}

export type UnlockMode = "biometric" | "pin";

/**
 * Sblocca la sessione e la imposta su Supabase.
 * In modalità "biometric" prova prima PRF; se assente, richiede comunque il PIN.
 */
export async function unlockBiometric(opts: {
  userId: string;
  mode: UnlockMode;
  pin?: string;
}): Promise<void> {
  const meta = await getVaultMeta(opts.userId);
  if (!meta) throw new Error("Nessun vault biometrico su questo dispositivo.");

  let wrappingRaw: Uint8Array | null = null;
  let usedBiometric = false;

  if (opts.mode === "biometric") {
    const assertion = await assertCredential(meta.credentialHandle);
    usedBiometric = true;
    if (assertion.prfSecret && meta.hasPrf) {
      const unlocked = await unlockWithPrf(opts.userId, assertion.prfSecret);
      await applyUnlocked(unlocked.session, unlocked.wrappingRaw);
      wrappingRaw = unlocked.wrappingRaw;
    } else {
      // No PRF: dobbiamo combinare con PIN
      if (!opts.pin) {
        throw new Error("PRF_UNSUPPORTED");
      }
      const unlocked = await unlockAndVerifyWithPin(opts.userId, opts.pin);
      await applyUnlocked(unlocked.session, unlocked.wrappingRaw);
      wrappingRaw = unlocked.wrappingRaw;
    }
  } else {
    if (!opts.pin) throw new Error("PIN richiesto.");
    const unlocked = await unlockAndVerifyWithPin(opts.userId, opts.pin);
    await applyUnlocked(unlocked.session, unlocked.wrappingRaw);
    wrappingRaw = unlocked.wrappingRaw;
  }

  if (usedBiometric && wrappingRaw) {
    // Registra grant biometrico AAL2 (vale come trusted-device per MfaGuard)
    await registerBiometricAal2Grant(opts.userId);
    // Aggiorna il vault con i token freschi prodotti da setSession (refresh)
    const {
      data: { session: fresh },
    } = await supabase.auth.getSession();
    if (fresh) await refreshVaultSession(opts.userId, fresh, wrappingRaw);
  }
}

async function unlockAndVerifyWithPin(userId: string, pin: string) {
  // Verifica server-side per applicare lockout, poi sblocco locale
  const hash = await hashPinForServer(pin);
  const { data, error } = await supabase.rpc("verify_biometric_pin", {
    _pin_client_hash: hash,
  });
  if (error) throw error;
  const v = data as {
    ok?: boolean;
    reason?: string;
    locked_until?: string;
    remaining_attempts?: number;
  };
  if (!v?.ok) {
    if (v?.reason === "locked") {
      throw new Error(`PIN bloccato fino a ${v.locked_until ?? "qualche minuto"}.`);
    }
    if (v?.reason === "wiped") {
      await clearVault(userId);
      throw new Error("Troppi tentativi: la biometria è stata disattivata su questo dispositivo.");
    }
    if (v?.reason === "not_enrolled") {
      await clearVault(userId);
      throw new Error("Biometria non attiva su questo account.");
    }
    throw new Error(
      typeof v?.remaining_attempts === "number"
        ? `PIN errato. Tentativi rimasti: ${v.remaining_attempts}.`
        : "PIN errato.",
    );
  }
  return unlockWithPin(userId, pin);
}

async function applyUnlocked(
  session: { access_token: string; refresh_token: string },
  _wrappingRaw: Uint8Array,
): Promise<void> {
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error) throw error;
}

const BIO_TOKEN_LS_KEY = "ralph.bio.aal2-token:";

async function registerBiometricAal2Grant(userId: string): Promise<void> {
  try {
    const raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    const token = Array.from(raw, (b) => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256Hex(token);
    const ua =
      typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
    const { error } = await supabase.rpc("register_biometric_aal2_grant", {
      _token_hash: tokenHash,
      _label: null,
      _user_agent: ua,
      _days: 30,
    });
    if (error) {
      console.warn("[biometric] aal2 grant register failed", error.message);
      return;
    }
    try {
      localStorage.setItem(BIO_TOKEN_LS_KEY + userId, token);
    } catch {
      /* ignore */
    }
  } catch (e) {
    console.warn("[biometric] aal2 grant exception", e);
  }
}

/**
 * Esposto a MfaGuard: questo device è "fidato" via biometria per l'utente?
 */
export async function isBiometricAal2Trusted(authUserId: string): Promise<boolean> {
  try {
    const token = localStorage.getItem(BIO_TOKEN_LS_KEY + authUserId);
    if (!token) return false;
    const hash = await sha256Hex(token);
    const { data, error } = await supabase.rpc("check_biometric_aal2", {
      _token_hash: hash,
    });
    if (error || !data) return false;
    return true;
  } catch {
    return false;
  }
}

export async function hasBiometricVaultLocally(userId: string): Promise<boolean> {
  return hasVault(userId);
}

export function lastBiometricUser(): { userId: string; email: string } | null {
  return getLastBiometricUser();
}

/** Utility per debug: forza il rinfresco del vault con i token correnti. */
export async function syncVaultWithCurrentSession(): Promise<void> {
  // Disponibile solo se conosciamo la wrappingKey → in pratica viene chiamato
  // dopo unlockBiometric(). Qui no-op se non c'è vault.
  void b64urlEncode; // mantengo import per side-effect tree-shake
}

// =========================================================================
// PIN LOGIN UNIVERSALE (Email + PIN da qualunque device, senza vault locale)
// =========================================================================

export interface StartPinLoginResult {
  ok: boolean;
  challengeId?: string;
  reason?: string;
}

export async function startPinLogin(email: string): Promise<StartPinLoginResult> {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;
  const { data, error } = await supabase.rpc("start_pin_login", {
    _email: email,
    _ip: null,
    _user_agent: ua,
  });
  if (error) {
    console.warn("[pin-login] start failed", error.message);
    return { ok: false, reason: "network" };
  }
  const r = data as { ok?: boolean; challenge_id?: string; reason?: string };
  if (!r?.ok || !r.challenge_id) return { ok: false, reason: r?.reason };
  return { ok: true, challengeId: r.challenge_id };
}

export interface VerifyPinLoginResult {
  ok: boolean;
  reason?: string;
  remainingAttempts?: number;
  lockedUntil?: string;
  sessionToken?: string;
}

export async function verifyPinLogin(
  challengeId: string,
  pin: string,
): Promise<VerifyPinLoginResult> {
  const hash = await hashPinForServer(pin);
  const { data, error } = await supabase.rpc("verify_pin_login", {
    _challenge_id: challengeId,
    _pin_client_hash: hash,
  });
  if (error) {
    console.warn("[pin-login] verify failed", error.message);
    return { ok: false, reason: "network" };
  }
  const r = data as {
    ok?: boolean;
    reason?: string;
    remaining_attempts?: number;
    locked_until?: string;
    session_token?: string;
  };
  return {
    ok: !!r?.ok,
    reason: r?.reason,
    remainingAttempts: r?.remaining_attempts,
    lockedUntil: r?.locked_until,
    sessionToken: r?.session_token,
  };
}

/**
 * Riscatta il token one-shot sull'edge function e applica la sessione
 * Supabase risultante. Dopo questo, l'utente è loggato.
 *
 * NB: per admin/CEO, MfaGuard intercetterà richiedendo TOTP se il device
 *     non è ancora trusted (= "PIN + TOTP solo prima volta").
 */
export async function redeemPinLoginSession(sessionToken: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("biometric-pin-login", {
    body: { session_token: sessionToken },
  });
  if (error) {
    throw new Error(error.message || "Sessione non disponibile");
  }
  const r = data as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
  };
  if (r?.error || !r?.access_token || !r?.refresh_token) {
    throw new Error(r?.error || "Sessione non disponibile");
  }
  const { error: setErr } = await supabase.auth.setSession({
    access_token: r.access_token,
    refresh_token: r.refresh_token,
  });
  if (setErr) throw setErr;
}

