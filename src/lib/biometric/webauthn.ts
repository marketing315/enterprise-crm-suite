/**
 * Wrapper su WebAuthn per lo "sblocco rapido biometrico".
 *
 * Usiamo un platform authenticator (Touch ID/Face ID/Windows Hello) come
 * gate di User Verification. Se il browser supporta l'extension `prf`
 * deriviamo un secret stabile dalla biometria; altrimenti la biometria
 * è solo "conferma di intento" e la cifratura viene fatta col PIN.
 */

export const RP_NAME = "CRM Gruppo Benessere";

const enc = new TextEncoder();
const PRF_SALT = enc.encode("ralph.bio.prf.salt.v1");

function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

function rpId(): string {
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
    const pk = window.PublicKeyCredential as unknown as {
      isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
    };
    if (!pk.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await pk.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export interface CreatedCredential {
  rawId: Uint8Array;
  hasPrf: boolean;
  prfSecret: Uint8Array | null;
  // Materiale necessario al server per registrare la passkey lato DB
  attestationObjectB64: string;
  clientDataJSONB64: string;
  challengeB64: string;
  credentialIdB64: string;
  rpId: string;
  origin: string;
  transports: string[];
}

interface PrfExtResult {
  prf?: { results?: { first?: ArrayBuffer } };
}

/**
 * Crea una credenziale platform e tenta di estrarre il secret PRF.
 */
function isInsecureContext(): boolean {
  return typeof window !== "undefined" && !window.isSecureContext;
}

function isCrossOriginIframe(): boolean {
  try {
    return typeof window !== "undefined" && window.top !== window.self;
  } catch {
    return true; // accessing window.top threw → cross-origin frame
  }
}

export async function createPlatformCredential(
  authUserId: string,
  userLabel: string,
): Promise<CreatedCredential> {
  if (!isWebAuthnAvailable()) throw new Error("WebAuthn non disponibile su questo browser.");
  if (isInsecureContext()) {
    throw new Error("Serve una connessione HTTPS sicura per attivare la biometria.");
  }
  if (isCrossOriginIframe()) {
    throw new Error(
      "Apri il CRM nel suo dominio (crm.gruppobenessere.it) — la biometria non funziona nell'anteprima embedded.",
    );
  }

  const challenge = randomBytes(32);
  const userId = enc.encode(authUserId);

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: bs(challenge) as ArrayBuffer,
    rp: { name: RP_NAME, id: rpId() },
    user: {
      id: bs(userId) as ArrayBuffer,
      name: userLabel,
      displayName: userLabel,
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 }, // ES256
      { type: "public-key", alg: -257 }, // RS256
    ],
    timeout: 60_000,
    attestation: "none",
    authenticatorSelection: {
      // Niente authenticatorAttachment forzato → permette passkey
      // sincronizzate via iCloud Keychain / Google Password Manager.
      residentKey: "required",
      requireResidentKey: true,
      userVerification: "required",
    },
    extensions: {
      // PRF non sempre presente nei tipi DOM lib; va passato così com'è
      ...({ prf: { eval: { first: PRF_SALT } } } as Record<string, unknown>),
    },
  };

  let cred: PublicKeyCredential | null;
  try {
    cred = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential | null;
  } catch (err) {
    const e = err as DOMException & { message?: string };
    const name = e?.name ?? "Error";
    const msg = e?.message ?? String(err);
    console.error("[biometric] WebAuthn create failed", name, msg, err);
    if (name === "NotAllowedError") {
      throw new Error("Permesso negato o operazione annullata. Riprova e conferma con Face ID/impronta.");
    }
    if (name === "SecurityError") {
      throw new Error(`Errore di sicurezza WebAuthn (${msg}). Verifica di essere sul dominio corretto.`);
    }
    if (name === "NotSupportedError") {
      throw new Error("Questo dispositivo/browser non supporta la biometria platform.");
    }
    if (name === "InvalidStateError") {
      throw new Error("Credenziale biometrica già esistente su questo dispositivo.");
    }
    throw new Error(`WebAuthn: ${name} — ${msg}`);
  }
  if (!cred) throw new Error("Creazione credenziale annullata");

  const rawId = new Uint8Array(cred.rawId);
  const resp = cred.response as AuthenticatorAttestationResponse;

  let prfSecret: Uint8Array | null = null;
  try {
    const ext = cred.getClientExtensionResults() as PrfExtResult;
    const first = ext?.prf?.results?.first;
    if (first) prfSecret = new Uint8Array(first);
  } catch {
    prfSecret = null;
  }

  let transports: string[] = [];
  try {
    const t = (resp as unknown as { getTransports?: () => string[] }).getTransports?.();
    if (Array.isArray(t)) transports = t;
  } catch { /* ignore */ }

  return {
    rawId,
    hasPrf: !!prfSecret,
    prfSecret,
    attestationObjectB64: b64urlEncode(resp.attestationObject),
    clientDataJSONB64: b64urlEncode(resp.clientDataJSON),
    challengeB64: b64urlEncode(challenge),
    credentialIdB64: b64urlEncode(rawId),
    rpId: rpId(),
    origin: window.location.origin,
    transports,
  };
}

export interface AssertionResult {
  prfSecret: Uint8Array | null;
}

/**
 * Asserzione biometrica: chiede a Face ID/impronta di confermare e
 * restituisce, se disponibile, il secret PRF.
 */
export async function assertCredential(rawId: Uint8Array): Promise<AssertionResult> {
  if (!isWebAuthnAvailable()) throw new Error("WebAuthn non disponibile");

  const challenge = randomBytes(32);
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: bs(challenge) as ArrayBuffer,
    timeout: 60_000,
    rpId: rpId(),
    userVerification: "required",
    allowCredentials: [{ id: bs(rawId) as ArrayBuffer, type: "public-key" }],
    extensions: {
      ...({ prf: { eval: { first: PRF_SALT } } } as Record<string, unknown>),
    },
  };

  const cred = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential | null;
  if (!cred) throw new Error("Verifica biometrica annullata");

  let prfSecret: Uint8Array | null = null;
  try {
    const ext = cred.getClientExtensionResults() as PrfExtResult;
    const first = ext?.prf?.results?.first;
    if (first) prfSecret = new Uint8Array(first);
  } catch {
    prfSecret = null;
  }
  return { prfSecret };
}
