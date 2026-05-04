/**
 * Constant-time string comparison to prevent timing attacks.
 *
 * Use whenever comparing secrets, HMAC signatures, API tokens, webhook
 * shared secrets, or any value where a timing side-channel would let an
 * attacker discover the expected value byte by byte.
 *
 * NEVER replace this with `===` for secret/signature checks.
 *
 * Returns false immediately for null/undefined or length mismatch — note
 * that the length-mismatch early return is itself a tiny side channel
 * (length is leaked) but length is not the secret. The byte comparison
 * runs over the full common length without short-circuiting.
 */
export function timingSafeEqual(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;

  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

/**
 * Compare a candidate against a primary and an optional previous secret
 * (for rotation windows). Both comparisons are constant-time.
 */
export function timingSafeEqualAny(
  candidate: string | null | undefined,
  primary: string | null | undefined,
  previous?: string | null | undefined,
): boolean {
  const matchPrimary = timingSafeEqual(candidate, primary);
  const matchPrevious = previous ? timingSafeEqual(candidate, previous) : false;
  // OR without short-circuit so both branches always execute
  return (matchPrimary as unknown as number) | (matchPrevious as unknown as number) ? true : false;
}
