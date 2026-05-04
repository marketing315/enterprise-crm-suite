// Contact data extraction from arbitrary JSON payloads.
// - normalizePhone: digit-only + country detection
// - tryExtractPhone: search common field names
// - tryExtractContactFields: name/email/city/cap/notes/address + IT address parsing
// - extractContactDataWithAI: fallback to Lovable AI Gateway
import type { ExtractedContactData, NormalizedPhone } from "./types.ts";

const COUNTRY_PREFIXES: Record<string, string> = {
  "39": "IT", "44": "GB", "49": "DE", "33": "FR",
  "34": "ES", "41": "CH", "43": "AT", "1": "US",
};

export function normalizePhone(phone: string, defaultCountry = "IT"): NormalizedPhone {
  const raw = phone;
  let normalized = phone.replace(/\D/g, "");
  let countryCode = defaultCountry;
  let assumedCountry = true;

  const sortedPrefixes = Object.entries(COUNTRY_PREFIXES).sort(
    (a, b) => b[0].length - a[0].length,
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

const PHONE_FIELDS = [
  "phone", "telefono", "mobile", "cellulare", "tel",
  "Phone", "Telefono", "Mobile", "Cellulare", "Tel",
  "phone_number", "phoneNumber", "numero_telefono", "numeroTelefono",
  "contact_phone", "contactPhone",
  "Numero di telefono", // Systeme.io fieldName
];

export function tryExtractPhone(payload: Record<string, unknown>): string | null {
  for (const field of PHONE_FIELDS) {
    const v = payload[field];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickFirstString(payload: Record<string, unknown>, fields: string[]): string | null {
  for (const f of fields) {
    const v = payload[f];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function tryExtractContactFields(payload: Record<string, unknown>): Partial<ExtractedContactData> {
  const result: Partial<ExtractedContactData> = {};

  result.first_name = pickFirstString(payload, ["first_name", "firstName", "nome", "name", "Nome", "Name"]) ?? undefined;
  result.last_name = pickFirstString(payload, ["last_name", "lastName", "cognome", "surname", "Cognome", "Surname"]) ?? undefined;

  const emailRaw = pickFirstString(payload, ["email", "Email", "e-mail", "mail"]);
  if (emailRaw) result.email = emailRaw.toLowerCase();

  result.city = pickFirstString(payload, ["city", "citta", "città", "City", "Citta", "locality", "Locality", "ort"]) ?? undefined;
  result.cap = pickFirstString(payload, ["cap", "zip", "postal_code", "postalCode", "CAP", "Zip"]) ?? undefined;
  result.notes = pickFirstString(payload, ["notes", "note", "message", "messaggio", "richiesta", "Notes", "Message"]) ?? undefined;
  result.address = pickFirstString(payload, ["address", "indirizzo", "Address", "Indirizzo", "full_address", "fullAddress"]) ?? undefined;

  // Parse city + CAP from Italian address strings: "Via X, 9, 24030 Terno D'isola BG, Italia"
  if (result.address && (!result.city || !result.cap)) {
    const capMatch = result.address.match(/\b(\d{5})\b/);
    if (capMatch && !result.cap) result.cap = capMatch[1];
    const cityMatch = result.address.match(/\b\d{5}\s+([A-Za-zÀ-ú''\s]+?)(?:\s+[A-Z]{2}\s*,|\s*,\s*Italia|\s*$)/i);
    if (cityMatch && !result.city) result.city = cityMatch[1].trim();
  }

  // Preferred days / time slot → append to notes
  const preferredDays = payload.preferred_days;
  const preferredTimeSlot = payload.preferred_time_slot || payload.preferredTimeSlot;
  if (preferredDays || preferredTimeSlot) {
    const parts: string[] = [];
    if (Array.isArray(preferredDays) && preferredDays.length > 0) {
      parts.push(`Giorni preferiti: ${preferredDays.join(", ")}`);
    }
    if (typeof preferredTimeSlot === "string") {
      parts.push(`Fascia oraria: ${preferredTimeSlot}`);
    }
    if (parts.length > 0) {
      const prefNote = parts.join(" | ");
      result.notes = result.notes ? `${result.notes}\n${prefNote}` : prefNote;
    }
  }

  // Quiz data (e.g. fibromialgia.ch) → append to notes
  if (payload.quiz_score !== undefined || payload.quiz_percentage !== undefined) {
    const quizParts: string[] = [];
    if (payload.quiz_score !== undefined) quizParts.push(`Punteggio: ${payload.quiz_score}/${payload.quiz_max_score || "?"}`);
    if (payload.quiz_percentage !== undefined) quizParts.push(`${payload.quiz_percentage}%`);
    const quizSummary = `Quiz: ${quizParts.join(" – ")}`;
    result.notes = result.notes ? `${result.notes}\n${quizSummary}` : quizSummary;
  }

  return result;
}

// === AI fallback extraction ===
const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

const AI_EXTRACTION_PROMPT = `Sei un estrattore di dati contatto. Analizza il payload JSON e estrai le informazioni del contatto.

REGOLE:
- Cerca campi che contengono: telefono, nome, cognome, email, città, CAP, indirizzo
- I campi possono avere nomi diversi (phone, telefono, mobile, cellulare, name, nome, address, indirizzo, ecc.)
- Se non trovi un campo, restituisci null per quel campo
- Il telefono è OBBLIGATORIO: cercalo in qualsiasi campo che possa contenerlo
- Se trovi testo libero, cerca di estrarre i dati da lì
- Per le note, includi qualsiasi informazione aggiuntiva rilevante (messaggio, richiesta, preferenze date/orari, ecc.)
- Se trovi un indirizzo completo (es. "Via XX, 9, 24030 Terno D'isola BG, Italia"), estrai anche città e CAP da esso

Rispondi SOLO con JSON valido nel formato:
{
  "phone": "numero telefono o null",
  "first_name": "nome o null",
  "last_name": "cognome o null", 
  "email": "email o null",
  "city": "città o null",
  "cap": "CAP o null",
  "notes": "note/messaggio o null",
  "address": "indirizzo completo o null"
}`;

export async function extractContactDataWithAI(
  payload: Record<string, unknown>,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ExtractedContactData | null> {
  try {
    const response = await fetchImpl(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: AI_EXTRACTION_PROMPT },
          {
            role: "user",
            content: `Estrai i dati contatto da questo payload:\n${JSON.stringify(payload, null, 2)}`,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      await response.text().catch(() => {});
      console.error("AI Gateway error:", response.status);
      return null;
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      console.error("No content in AI response");
      return null;
    }

    let jsonStr = content.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
    if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
    if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);

    return JSON.parse(jsonStr.trim()) as ExtractedContactData;
  } catch (err) {
    console.error("AI extraction error:", err);
    return null;
  }
}
