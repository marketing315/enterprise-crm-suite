// _shared/cose-alg.ts
// Estrae l'algoritmo (COSE label 3) da una public key WebAuthn in formato CBOR/COSE.
// La chiave è una mappa CBOR con chiavi numeriche; ci interessa solo la entry "3"
// (alg). Niente librerie CBOR full-featured: parser minimale.
//
// Valori attesi: -7 (ES256), -257 (RS256), -8 (EdDSA), -35 (ES384), -36 (ES512),
// -37 (PS256), -258 (RS384), -259 (RS512).

const COSE_LABEL_ALG = 3;

interface DecodeState {
  buf: Uint8Array;
  i: number;
}

function readUint(s: DecodeState, info: number): number {
  if (info < 24) return info;
  if (info === 24) {
    const v = s.buf[s.i];
    s.i += 1;
    return v;
  }
  if (info === 25) {
    const v = (s.buf[s.i] << 8) | s.buf[s.i + 1];
    s.i += 2;
    return v;
  }
  if (info === 26) {
    const v =
      s.buf[s.i] * 0x1000000 +
      (s.buf[s.i + 1] << 16) +
      (s.buf[s.i + 2] << 8) +
      s.buf[s.i + 3];
    s.i += 4;
    return v >>> 0;
  }
  if (info === 27) {
    // 64-bit: solo per oggetti enormi, qui non serve. Saltiamo 8 byte.
    let v = 0;
    for (let k = 0; k < 8; k++) v = v * 256 + s.buf[s.i + k];
    s.i += 8;
    return v;
  }
  throw new Error("cose: unsupported integer encoding");
}

function skipValue(s: DecodeState): void {
  const ib = s.buf[s.i++];
  const major = ib >> 5;
  const info = ib & 0x1f;
  switch (major) {
    case 0: // uint
    case 1: // nint
      readUint(s, info);
      return;
    case 2: // byte string
    case 3: {
      // text string
      const n = readUint(s, info);
      s.i += n;
      return;
    }
    case 4: {
      // array
      const n = readUint(s, info);
      for (let k = 0; k < n; k++) skipValue(s);
      return;
    }
    case 5: {
      // map
      const n = readUint(s, info);
      for (let k = 0; k < n; k++) {
        skipValue(s);
        skipValue(s);
      }
      return;
    }
    case 7: // simple/float — qui solo i casi small
      if (info < 24) return;
      if (info === 24) {
        s.i += 1;
        return;
      }
      if (info === 25) {
        s.i += 2;
        return;
      }
      if (info === 26) {
        s.i += 4;
        return;
      }
      if (info === 27) {
        s.i += 8;
        return;
      }
      throw new Error("cose: unsupported simple");
    default:
      throw new Error(`cose: unsupported major ${major}`);
  }
}

function readKey(s: DecodeState): number | null {
  const ib = s.buf[s.i++];
  const major = ib >> 5;
  const info = ib & 0x1f;
  if (major === 0) return readUint(s, info); // positive int
  if (major === 1) return -1 - readUint(s, info); // negative int
  // Chiave non numerica: la saltiamo all'indietro come "non interessante".
  s.i--;
  skipValue(s);
  return null;
}

function readIntValue(s: DecodeState): number {
  const ib = s.buf[s.i++];
  const major = ib >> 5;
  const info = ib & 0x1f;
  if (major === 0) return readUint(s, info);
  if (major === 1) return -1 - readUint(s, info);
  // Non un int: torna indietro e salta
  s.i--;
  skipValue(s);
  return NaN;
}

/**
 * Estrae il valore COSE alg (label 3) da una public key COSE.
 * Restituisce null se non parsabile o non presente.
 */
export function extractCoseAlg(publicKey: Uint8Array): number | null {
  try {
    const s: DecodeState = { buf: publicKey, i: 0 };
    const ib = s.buf[s.i++];
    const major = ib >> 5;
    const info = ib & 0x1f;
    if (major !== 5) return null; // attesa: map
    const n = readUint(s, info);
    for (let k = 0; k < n; k++) {
      const key = readKey(s);
      if (key === null) continue;
      if (key === COSE_LABEL_ALG) {
        const v = readIntValue(s);
        return Number.isFinite(v) ? v : null;
      }
      skipValue(s);
    }
    return null;
  } catch {
    return null;
  }
}
