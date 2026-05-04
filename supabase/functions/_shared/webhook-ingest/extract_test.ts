import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizePhone, tryExtractPhone, tryExtractContactFields } from "./extract.ts";

Deno.test("normalizePhone: IT prefix stripped when >10 digits", () => {
  const n = normalizePhone("+39 333 1234567");
  assertEquals(n.normalized, "3331234567");
  assertEquals(n.countryCode, "IT");
  assertEquals(n.assumedCountry, false);
});

Deno.test("normalizePhone: bare 10-digit IT mobile, assumes country", () => {
  const n = normalizePhone("3331234567");
  assertEquals(n.normalized, "3331234567");
  assertEquals(n.assumedCountry, true);
});

Deno.test("normalizePhone: longer prefixes win (44 GB)", () => {
  const n = normalizePhone("+44 7700 900123");
  assertEquals(n.countryCode, "GB");
  assertEquals(n.normalized, "7700900123");
});

Deno.test("normalizePhone: keeps raw", () => {
  const n = normalizePhone("  +39 333-12 34 567  ");
  assertEquals(n.raw, "  +39 333-12 34 567  ");
  assertEquals(n.normalized, "3331234567");
});

Deno.test("tryExtractPhone: matches common field names", () => {
  assertEquals(tryExtractPhone({ phone: "111" }), "111");
  assertEquals(tryExtractPhone({ Telefono: "222" }), "222");
  assertEquals(tryExtractPhone({ "Numero di telefono": "333" }), "333");
  assertEquals(tryExtractPhone({ irrelevant: "x" }), null);
});

Deno.test("tryExtractContactFields: lowercases email", () => {
  const r = tryExtractContactFields({ email: "MIXED@Case.IT" });
  assertEquals(r.email, "mixed@case.it");
});

Deno.test("tryExtractContactFields: parses CAP+city from Italian address", () => {
  const r = tryExtractContactFields({
    address: "Via Roma, 9, 24030 Terno D'isola BG, Italia",
  });
  assertEquals(r.cap, "24030");
  assert(r.city?.includes("Terno"));
});

Deno.test("tryExtractContactFields: appends preferred days/time to notes", () => {
  const r = tryExtractContactFields({
    notes: "Richiesta info",
    preferred_days: ["Lun", "Mer"],
    preferred_time_slot: "Pomeriggio",
  });
  assert(r.notes?.includes("Richiesta info"));
  assert(r.notes?.includes("Giorni preferiti: Lun, Mer"));
  assert(r.notes?.includes("Fascia oraria: Pomeriggio"));
});

Deno.test("tryExtractContactFields: appends quiz summary", () => {
  const r = tryExtractContactFields({ quiz_score: 7, quiz_max_score: 10, quiz_percentage: 70 });
  assert(r.notes?.startsWith("Quiz: Punteggio: 7/10"));
  assert(r.notes?.includes("70%"));
});
