import { describe, expect, it } from "vitest";
import {
  aesGcmOpen,
  aesGcmSeal,
  deriveKeyFromPin,
  generateAesKey,
  randomBytes,
  sha256Hex,
  utf8Decode,
  utf8Encode,
} from "@/lib/biometric/crypto";

describe("biometric crypto roundtrip", () => {
  it("AES-GCM seals and opens with the same key", async () => {
    const { key } = await generateAesKey();
    const data = utf8Encode("ciao mondo segreto");
    const sealed = await aesGcmSeal(key, data);
    const opened = await aesGcmOpen(key, sealed);
    expect(utf8Decode(opened)).toBe("ciao mondo segreto");
  });

  it("decryption fails with a wrong key", async () => {
    const a = await generateAesKey();
    const b = await generateAesKey();
    const sealed = await aesGcmSeal(a.key, utf8Encode("payload"));
    await expect(aesGcmOpen(b.key, sealed)).rejects.toBeTruthy();
  });

  it("PBKDF2 derivation: same PIN + same salt → same key works, wrong PIN fails", async () => {
    const salt = randomBytes(16);
    const right = await deriveKeyFromPin("249103", salt);
    const wrong = await deriveKeyFromPin("249104", salt);
    const sealed = await aesGcmSeal(right, utf8Encode("token-bag"));
    const opened = await aesGcmOpen(right, sealed);
    expect(utf8Decode(opened)).toBe("token-bag");
    await expect(aesGcmOpen(wrong, sealed)).rejects.toBeTruthy();
  });

  it("sha256Hex is deterministic and 64-char hex", async () => {
    const a = await sha256Hex("lovable");
    const b = await sha256Hex("lovable");
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
