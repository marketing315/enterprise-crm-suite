/**
 * Primitive crypto per il vault biometrico.
 * - AES-GCM 256 per cifrare la sessione Supabase.
 * - PBKDF2-SHA256 250k iterazioni per derivare una chiave dal PIN.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Cast helper: TS strict richiede ArrayBufferView<ArrayBuffer> per BufferSource. */
function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

export function randomBytes(n: number): Uint8Array {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

export async function sha256Hex(input: string | Uint8Array): Promise<string> {
  const buf: BufferSource = typeof input === "string" ? bs(enc.encode(input)) : bs(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    bs(enc.encode(pin)),
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bs(salt), iterations: 250_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function importAesKeyFromRaw(raw: Uint8Array): Promise<CryptoKey> {
  // Il secret PRF è tipicamente 32 byte; in altri casi riduciamo via SHA-256.
  let keyBytes: Uint8Array;
  if (raw.length === 32) {
    keyBytes = raw;
  } else {
    const digest = await crypto.subtle.digest("SHA-256", bs(raw));
    keyBytes = new Uint8Array(digest);
  }
  return crypto.subtle.importKey(
    "raw",
    bs(keyBytes),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateAesKey(): Promise<{ key: CryptoKey; raw: Uint8Array }> {
  const raw = randomBytes(32);
  const key = await importAesKeyFromRaw(raw);
  return { key, raw };
}

export interface SealedBlob {
  iv: Uint8Array; // 12 byte
  ciphertext: Uint8Array;
}

export async function aesGcmSeal(key: CryptoKey, plaintext: Uint8Array): Promise<SealedBlob> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(plaintext));
  return { iv, ciphertext: new Uint8Array(ct) };
}

export async function aesGcmOpen(key: CryptoKey, blob: SealedBlob): Promise<Uint8Array> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(blob.iv) },
    key,
    bs(blob.ciphertext),
  );
  return new Uint8Array(pt);
}

export function utf8Encode(s: string): Uint8Array {
  return enc.encode(s);
}

export function utf8Decode(b: Uint8Array): string {
  return dec.decode(b);
}
