// Phone normalization utilities (client-side mirror of server logic)

export interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

const COUNTRY_PREFIXES: Record<string, string> = {
  "39": "IT",
  "44": "GB",
  "49": "DE",
  "33": "FR",
  "34": "ES",
  "41": "CH",
  "43": "AT",
  "1": "US",
};

export function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone.trim();
  let normalized = raw.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  // Sort prefixes by length (longest first) for accurate matching
  const sortedPrefixes = Object.entries(COUNTRY_PREFIXES).sort(
    (a, b) => b[0].length - a[0].length
  );

  for (const [prefix, country] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > 10) {
      normalized = normalized.slice(prefix.length);
      countryCode = country;
      assumedCountry = false;
      break;
    }
  }

  return { normalized, countryCode, assumedCountry, raw };
}

export function isValidPhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 15;
}

export function formatPhoneDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  // Basic Italian format: XXX XXX XXXX
  if (normalized.normalized.length === 10) {
    return `${normalized.normalized.slice(0, 3)} ${normalized.normalized.slice(3, 6)} ${normalized.normalized.slice(6)}`;
  }
  return normalized.raw;
}
