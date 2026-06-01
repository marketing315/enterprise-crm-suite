/**
 * Cassaforte locale (IndexedDB) per la sessione Supabase sbloccabile
 * con Face ID/impronta o PIN.
 *
 * Per ogni utente memorizziamo:
 *   - credentialHandle  → rawId della credenziale WebAuthn (b64url)
 *   - hasPrf            → l'autenticatore ha restituito un PRF secret?
 *   - wrappedSession    → sessione Supabase cifrata con `wrappingKey`
 *   - wrappedKeyByPrf   → wrappingKey cifrata con il secret PRF (se hasPrf)
 *   - wrappedKeyByPin   → wrappingKey cifrata con la chiave derivata dal PIN
 *   - pinSalt           → salt PBKDF2 per il PIN
 *   - userEmail         → email per UI "sblocca account X"
 *
 * Niente è in chiaro: senza Face ID o PIN la sessione non si decifra.
 */
import type { Session } from "@supabase/supabase-js";
import {
  aesGcmOpen,
  aesGcmSeal,
  deriveKeyFromPin,
  generateAesKey,
  importAesKeyFromRaw,
  randomBytes,
  utf8Decode,
  utf8Encode,
} from "./crypto";
import { b64urlDecode, b64urlEncode } from "./webauthn";

const DB_NAME = "ralph-bio-vault";
const STORE = "vaults";
const LAST_USER_KEY = "ralph.bio.lastUser";

interface VaultRecord {
  userId: string;
  userEmail: string;
  credentialHandle: string; // b64url
  hasPrf: boolean;
  pinSalt: string; // b64url
  // wrappedKeyBy* sono blob { iv, ct } in b64url separati
  wrappedKeyByPrf?: { iv: string; ct: string };
  wrappedKeyByPin: { iv: string; ct: string };
  wrappedSession: { iv: string; ct: string };
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "userId" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putRecord(rec: VaultRecord): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function getRecord(userId: string): Promise<VaultRecord | null> {
  const db = await openDb();
  try {
    return await new Promise<VaultRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(userId);
      req.onsuccess = () => resolve((req.result as VaultRecord | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function deleteRecord(userId: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(userId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export function getLastBiometricUser(): { userId: string; email: string } | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.userId === "string" && typeof parsed.email === "string") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function setLastBiometricUser(userId: string, email: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify({ userId, email }));
  } catch {
    /* ignore */
  }
}

function clearLastBiometricUser(userId: string): void {
  try {
    const cur = getLastBiometricUser();
    if (cur?.userId === userId) localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* ignore */
  }
}

export async function hasVault(userId: string): Promise<boolean> {
  try {
    const rec = await getRecord(userId);
    return !!rec;
  } catch {
    return false;
  }
}

export async function clearVault(userId: string): Promise<void> {
  await deleteRecord(userId).catch(() => undefined);
  clearLastBiometricUser(userId);
}

function sessionToBytes(session: Session): Uint8Array {
  const payload = {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    token_type: session.token_type,
  };
  return utf8Encode(JSON.stringify(payload));
}

interface MinimalSession {
  access_token: string;
  refresh_token: string;
}

function bytesToSession(bytes: Uint8Array): MinimalSession {
  const parsed = JSON.parse(utf8Decode(bytes));
  if (typeof parsed?.access_token !== "string" || typeof parsed?.refresh_token !== "string") {
    throw new Error("Vault corrotto");
  }
  return { access_token: parsed.access_token, refresh_token: parsed.refresh_token };
}

function packBlob(blob: { iv: Uint8Array; ciphertext: Uint8Array }): { iv: string; ct: string } {
  return { iv: b64urlEncode(blob.iv), ct: b64urlEncode(blob.ciphertext) };
}

function unpackBlob(b: { iv: string; ct: string }): { iv: Uint8Array; ciphertext: Uint8Array } {
  return { iv: b64urlDecode(b.iv), ciphertext: b64urlDecode(b.ct) };
}

/**
 * Crea il vault al primo enrollment.
 */
export async function createVault(params: {
  userId: string;
  userEmail: string;
  session: Session;
  pin: string;
  credentialHandle: Uint8Array;
  prfSecret: Uint8Array | null;
}): Promise<void> {
  const { key: wrappingKey, raw: wrappingRaw } = await generateAesKey();
  const sessionBytes = sessionToBytes(params.session);
  const sealedSession = await aesGcmSeal(wrappingKey, sessionBytes);

  const pinSalt = randomBytes(16);
  const pinKey = await deriveKeyFromPin(params.pin, pinSalt);
  const sealedByPin = await aesGcmSeal(pinKey, wrappingRaw);

  let sealedByPrf: { iv: Uint8Array; ciphertext: Uint8Array } | null = null;
  if (params.prfSecret) {
    const prfKey = await importAesKeyFromRaw(params.prfSecret);
    sealedByPrf = await aesGcmSeal(prfKey, wrappingRaw);
  }

  const rec: VaultRecord = {
    userId: params.userId,
    userEmail: params.userEmail,
    credentialHandle: b64urlEncode(params.credentialHandle),
    hasPrf: !!params.prfSecret,
    pinSalt: b64urlEncode(pinSalt),
    wrappedKeyByPin: packBlob(sealedByPin),
    wrappedKeyByPrf: sealedByPrf ? packBlob(sealedByPrf) : undefined,
    wrappedSession: packBlob(sealedSession),
    createdAt: Date.now(),
  };
  await putRecord(rec);
  setLastBiometricUser(params.userId, params.userEmail);
}

/**
 * Aggiorna la sessione (refresh dei token) senza richiedere PIN/biometria:
 * la wrappingKey resta la stessa, ricifriamo solo il blob della sessione.
 * Usabile solo se conosciamo la wrappingKey (es. subito dopo login password
 * mentre l'utente ha un vault già esistente).
 *
 * Implementazione semplificata: se non possiamo aggiornare in-place, lasciamo
 * intatto il vault — la sessione cifrata rimane valida finché il refresh_token
 * non scade lato Supabase.
 */
export async function refreshVaultSession(
  userId: string,
  newSession: Session,
  wrappingRaw: Uint8Array,
): Promise<void> {
  const rec = await getRecord(userId);
  if (!rec) return;
  const key = await importAesKeyFromRaw(wrappingRaw);
  const sealed = await aesGcmSeal(key, sessionToBytes(newSession));
  rec.wrappedSession = packBlob(sealed);
  await putRecord(rec);
}

export interface UnlockedSession {
  session: MinimalSession;
  wrappingRaw: Uint8Array;
}

async function unwrapSession(
  rec: VaultRecord,
  wrappingRaw: Uint8Array,
): Promise<UnlockedSession> {
  const key = await importAesKeyFromRaw(wrappingRaw);
  const sessionBytes = await aesGcmOpen(key, unpackBlob(rec.wrappedSession));
  return { session: bytesToSession(sessionBytes), wrappingRaw };
}

export interface VaultMeta {
  userId: string;
  userEmail: string;
  hasPrf: boolean;
  credentialHandle: Uint8Array;
}

export async function getVaultMeta(userId: string): Promise<VaultMeta | null> {
  const rec = await getRecord(userId);
  if (!rec) return null;
  return {
    userId: rec.userId,
    userEmail: rec.userEmail,
    hasPrf: rec.hasPrf,
    credentialHandle: b64urlDecode(rec.credentialHandle),
  };
}

export async function unlockWithPrf(
  userId: string,
  prfSecret: Uint8Array,
): Promise<UnlockedSession> {
  const rec = await getRecord(userId);
  if (!rec || !rec.wrappedKeyByPrf) throw new Error("PRF non disponibile per questo vault");
  const prfKey = await importAesKeyFromRaw(prfSecret);
  const wrappingRaw = await aesGcmOpen(prfKey, unpackBlob(rec.wrappedKeyByPrf));
  return unwrapSession(rec, wrappingRaw);
}

export async function unlockWithPin(userId: string, pin: string): Promise<UnlockedSession> {
  const rec = await getRecord(userId);
  if (!rec) throw new Error("Vault non trovato");
  const salt = b64urlDecode(rec.pinSalt);
  const pinKey = await deriveKeyFromPin(pin, salt);
  const wrappingRaw = await aesGcmOpen(pinKey, unpackBlob(rec.wrappedKeyByPin));
  return unwrapSession(rec, wrappingRaw);
}
