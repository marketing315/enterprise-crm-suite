// src/lib/biometric/passkey-devices.ts
// Helper client per gestire le passkey multi-dispositivo (tabella user_passkeys).
// Separato da client.ts (che gestisce PIN+vault biometrico locale) per
// mantenere chiaro il confine: questo modulo NON tocca il vault locale.

import { supabase } from "@/integrations/supabase/client";
import { createPlatformCredential } from "./webauthn";

export interface PasskeyDevice {
  id: string;
  label: string | null;
  user_agent: string | null;
  aaguid: string | null;
  transports: string[] | null;
  created_at: string;
  last_used_at: string | null;
}

export async function listMyPasskeys(): Promise<PasskeyDevice[]> {
  const { data, error } = await supabase.rpc("list_my_passkeys");
  if (error) throw error;
  return ((data as PasskeyDevice[]) ?? []).map((d) => ({
    id: d.id,
    label: d.label ?? null,
    user_agent: d.user_agent ?? null,
    aaguid: d.aaguid ?? null,
    transports: d.transports ?? null,
    created_at: d.created_at,
    last_used_at: d.last_used_at ?? null,
  }));
}

export async function renameMyPasskey(id: string, label: string): Promise<void> {
  const { error } = await supabase.rpc("rename_my_passkey", {
    _id: id,
    _label: label,
  });
  if (error) throw error;
}

export async function revokeMyPasskey(id: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_my_passkey", { _id: id });
  if (error) throw error;
}

/**
 * Registra una NUOVA passkey su questo dispositivo per l'utente già loggato.
 * Non tocca PIN/vault: crea solo una credenziale WebAuthn e la salva in user_passkeys.
 */
export async function addPasskeyOnThisDevice(label?: string): Promise<void> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) throw new Error("Devi essere connesso per aggiungere una passkey.");

  const userId = session.user.id;
  const userEmail = session.user.email ?? "account";

  const created = await createPlatformCredential(userId, userEmail);

  const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 200) : null;

  const { error } = await supabase.functions.invoke("passkey-register", {
    body: {
      challenge: created.challengeB64,
      rpId: created.rpId,
      origin: created.origin,
      attestationObject: created.attestationObjectB64,
      clientDataJSON: created.clientDataJSONB64,
      credentialId: created.credentialIdB64,
      transports: created.transports,
      label: (label ?? defaultLabelFromUA(ua)) || null,
      userAgent: ua,
    },
  });
  if (error) {
    throw new Error(error.message || "Registrazione passkey fallita");
  }
}

function defaultLabelFromUA(ua: string | null): string {
  if (!ua) return "Questo dispositivo";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Linux/i.test(ua)) return "Linux";
  return "Questo dispositivo";
}
