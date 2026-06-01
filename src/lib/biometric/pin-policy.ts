/**
 * Regole sul PIN biometrico.
 * - Esattamente 6 cifre.
 * - Niente 6 cifre uguali (000000, 111111…).
 * - Niente sequenze incrementali/decrementali banali (123456, 987654…).
 */

export interface PinValidation {
  ok: boolean;
  reason?: string;
}

export function validatePin(pin: string): PinValidation {
  if (!/^\d{6}$/.test(pin)) return { ok: false, reason: "Il PIN deve essere di 6 cifre." };

  if (/^(\d)\1{5}$/.test(pin)) {
    return { ok: false, reason: "Il PIN non può essere fatto di una sola cifra ripetuta." };
  }

  const digits = pin.split("").map(Number);
  const isInc = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 1) % 10);
  const isDec = digits.every((d, i) => i === 0 || d === (digits[i - 1] + 9) % 10);
  if (isInc || isDec) {
    return { ok: false, reason: "Il PIN non può essere una sequenza (es. 123456)." };
  }

  return { ok: true };
}
