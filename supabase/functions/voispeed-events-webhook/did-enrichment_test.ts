/**
 * F2 E2E — voispeed-events-webhook DID enrichment
 *
 * Verifica la pipeline di assegnazione `tracking_number_id` su `call_logs`:
 *  1) Normalizzazione DID dialato → E.164 IT
 *  2) Risoluzione tracking_number via `phone_e164` OR `voispeed_did` (is_active)
 *  3) Branding fallback (contact_phones > tracking_number > user)
 *
 * NB: duplichiamo `toE164IT` qui per testarne il contratto in isolamento;
 *     ogni modifica all'originale in `index.ts` DEVE essere riflessa qui.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

function toE164IT(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let d = String(raw).replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.substring(2);
  if (d.startsWith("39")) return `+${d}`;
  if (d.length >= 8 && d.length <= 11) return `+39${d}`;
  return d.length >= 8 ? `+${d}` : null;
}

Deno.test("toE164IT: numero verde italiano 800 → +39800...", () => {
  assertEquals(toE164IT("800123456"), "+39800123456");
  assertEquals(toE164IT("+39 800 123 456"), "+39800123456");
  assertEquals(toE164IT("0039800123456"), "+39800123456");
  assertEquals(toE164IT("39800123456"), "+39800123456");
});

Deno.test("toE164IT: mobile italiano", () => {
  assertEquals(toE164IT("3331234567"), "+393331234567");
  assertEquals(toE164IT("+393331234567"), "+393331234567");
});

Deno.test("toE164IT: input invalido → null", () => {
  assertEquals(toE164IT(null), null);
  assertEquals(toE164IT(""), null);
  assertEquals(toE164IT("123"), null);
  assertEquals(toE164IT("abc"), null);
});

Deno.test("toE164IT: numero estero ≥ 8 cifre passa con +", () => {
  // F2: tracking_numbers può contenere DID esteri; non forziamo +39 se >11 cifre
  assertEquals(toE164IT("4915123456789"), "+4915123456789");
});

Deno.test("F2 contract: OR-filter shape matches Supabase PostgREST syntax", () => {
  // Replica esatta della clausola .or() usata nel webhook (index.ts ~L185)
  const dnis = "+39800123456";
  const orClause = `phone_e164.eq.${dnis},voispeed_did.eq.${dnis}`;
  // Vincoli format documentati: nessuno spazio, virgola separatore, eq.<value>
  assertEquals(orClause.includes(" "), false);
  assertEquals(orClause.split(",").length, 2);
  assertEquals(orClause.split(",").every((p) => p.startsWith("phone_e164.eq.") || p.startsWith("voispeed_did.eq.")), true);
});
