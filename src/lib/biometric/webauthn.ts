/**
 * Wrapper su WebAuthn per lo "sblocco rapido biometrico".
 *
 * Strategia: usiamo un platform authenticator (Touch ID/Face ID/Windows Hello)
 * solo come "gate" di User Verification. Se il browser supporta l'extension
 * `prf` (Chrome desktop/Android, iOS 17+ Safari) deriviamo un secret stabile
 * dalla biometria e lo usiamo per cifrare la sessione locale. Su browser
 * senza PRF il PIN diventa la chiave di cifratura primaria e la biometria
 * resta solo un'asserzione di "presenza".
 */

export const RP_NAME = "CRM Gruppo Benessere";

const enc = new TextEncoder();
const PRF_SALT = enc.encode("ralph.bio.prf.salt.v1");

function rpId(): string {
  // Usa l'hostname corrente: WebAuthn richiede match esatto su rpId.
  return window.location.hostname;
}

function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

export function b64urlEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials &&
    typeof navigator.credentials.create === "function" &&
    typeof navigator.credentials.get === "function"
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnAvailable()) return false;
  try {
    // @ts-expect-error: presente su browser supportati
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface CreatedCredential {
  rawId: Uint8Array;
  hasPrf: boolean;
  prfSecret: Uint8Array | null;
}

/**
 * Crea una credenziale platform (Face ID/impronta) per l'utente corrente.
 * Restituisce il rawId da memorizzare nel vault locale e, se possibile,
 * il secret PRF da usare come chiave di cifratura.
 */
export async function createPlatformCredential(
  authUserId: string,
  userLabel: string,
): Promise<CreatedCredential> {
  if (!isWebAuthnAvailable()) throw new Error("WebAuthn non disponibile");

  const challenge = randomBytes(32);
  const userId = enc.encode(authUserId);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge,
    rp: { name: RP_NAME, id: rpId() },
    user: { id: userId, name: userLabel, displayName: userLabel },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      residentKey: "preferred",
      userVerification: "required",
    },
    extensions: {
      // @ts-expect-error: PRF non sempre tipizzato
      prf: { eval: { first: PRF_SALT } },
    },
  };

  const cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Creazione credenziale annullata");

  const rawId = new Uint8Array(cred.rawId);

  let prfSecret: Uint8Array | null = null;
  try {
    // @ts-expect-error: extension result
    const ext = cred.getClientExtensionResults?.();
    const first: ArrayBuffer | undefined = ext?.prf?.results?.first;
    if (first) prfSecret = new Uint8Array(first);
  } catch {
    prfSecret = null;
  }

  return { rawId, hasPrf: !!prfSecret, prfSecret };
}

export interface AssertionResult {
  prfSecret: Uint8Array | null;
}

/**
 * Esegue un'asserzione: chiede a Face ID/impronta di confermare l'identità.
 * Restituisce il secret PRF se l'autenticatore lo supporta.
 */
export async function assertCredential(rawId: Uint8Array): Promise<AssertionResult> {
  if (!isWebAuthnAvailable()) throw new Error("WebAuthn non disponibile");

  const challenge = randomBytes(32);
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge,
    timeout: 60_000,
    rpId: rpId(),
    userVerification: "required",
    allowCredentials: [{ id: rawId, type: "public-key" }],
    extensions: {
      // @ts-expect-error: PRF non sempre tipizzato
      prf: { eval: { first: PRF_SALT } },
    },
  };

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Verifica biometrica annullata");

  let prfSecret: Uint8Array | null = null;
  try {
    // @ts-expect-error: extension result
    const ext = cred.getClientExtensionResults?.();
    const first: ArrayBuffer | undefined = ext?.prf?.results?.first;
    if (first) prfSecret = new Uint8Array(first);
  } catch {
    prfSecret = null;
  }
  return { prfSecret };
}
