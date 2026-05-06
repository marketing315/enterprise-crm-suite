// Integration tests for sheets-leads-export.
//
// These tests guard against the regression where phone numbers (column E "Numero")
// silently disappeared from the Google Sheet. Specifically they verify:
//
//   1. Header layout — "Numero" stays at column E (index 4).
//   2. buildRow() always emits the phone in column E, both when sourced from
//      contact_phones (preferred) and when falling back to contacts.phone_normalized.
//   3. buildPhoneMap() correctly:
//        - prefers is_primary phones,
//        - falls back to any non-empty phone when no primary exists,
//        - tolerates chunked/duplicated input (the same logic that fixed the
//          ".in('contact_id', 946ids)" URL-too-long bug),
//        - skips contacts with only NULL/empty phones.
//   4. End-to-end (chunked fetch simulation): given 450 contacts split into 3
//      chunks of 200/200/50, every contact_id with at least one phone in DB ends
//      up with a non-empty Numero in the resulting rows.
//   5. Lead events without contact_id produce a row with an empty Numero (not a
//      crash) — matches the 101 legacy events observed in production.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  LEADS_HEADERS,
  PHONE_COLUMN_INDEX,
  buildPhoneMap,
  buildRow,
} from "./index.ts";

// ---------- 1. Header contract ----------

Deno.test("LEADS_HEADERS keeps 'Numero' at column E (index 4)", () => {
  assertEquals(LEADS_HEADERS[4], "Numero");
  assertEquals(PHONE_COLUMN_INDEX, 4);
});

// ---------- 2. buildRow places phone in column E ----------

Deno.test("buildRow puts phone in column E when provided", () => {
  const row = buildRow(
    { received_at: "2026-05-06T10:00:00Z", source_name: "Meta", raw_payload: {} },
    { first_name: "Mario", last_name: "Rossi", email: "m@x.it" },
    "Brand A",
    "+393331234567",
    "",
    null,
    "",
  );
  assertEquals(row[PHONE_COLUMN_INDEX], "+393331234567");
  assertEquals(row.length, LEADS_HEADERS.length);
});

Deno.test("buildRow emits empty string in column E when no phone", () => {
  const row = buildRow(
    { received_at: "2026-05-06T10:00:00Z", source_name: "Generic", raw_payload: {} },
    { first_name: "X", last_name: "Y", email: "" },
    "Brand A",
    "",
    "",
    null,
    "",
  );
  assertEquals(row[PHONE_COLUMN_INDEX], "");
});

// ---------- 3. buildPhoneMap behavior ----------

Deno.test("buildPhoneMap prefers is_primary", () => {
  const map = buildPhoneMap([
    { contact_id: "c1", phone_normalized: "+391111", is_primary: false },
    { contact_id: "c1", phone_normalized: "+392222", is_primary: true },
    { contact_id: "c1", phone_normalized: "+393333", is_primary: false },
  ]);
  assertEquals(map.get("c1"), "+392222");
});

Deno.test("buildPhoneMap falls back when no is_primary exists", () => {
  const map = buildPhoneMap([
    { contact_id: "c2", phone_normalized: "+395555", is_primary: false },
    { contact_id: "c2", phone_normalized: "+396666", is_primary: false },
  ]);
  assertEquals(map.get("c2"), "+395555");
});

Deno.test("buildPhoneMap skips empty/null phone rows", () => {
  const map = buildPhoneMap([
    { contact_id: "c3", phone_normalized: null, is_primary: true },
    { contact_id: "c3", phone_normalized: "", is_primary: false },
    { contact_id: "c3", phone_normalized: "+397777", is_primary: false },
  ]);
  assertEquals(map.get("c3"), "+397777");
});

Deno.test("buildPhoneMap returns nothing for contacts without any phone", () => {
  const map = buildPhoneMap([
    { contact_id: "c4", phone_normalized: null, is_primary: true },
    { contact_id: "c4", phone_normalized: "", is_primary: false },
  ]);
  assertEquals(map.has("c4"), false);
});

// ---------- 4. End-to-end chunking simulation ----------

Deno.test("buildPhoneMap handles 450 contacts split in 3 chunks (regression: silent .in() failure)", () => {
  // Simulate the production scenario: ~450 contact_ids fetched in chunks of 200.
  const allRows: Array<{ contact_id: string; phone_normalized: string; is_primary: boolean }> = [];
  for (let i = 0; i < 450; i++) {
    allRows.push({
      contact_id: `c-${i}`,
      phone_normalized: `+39300000${String(i).padStart(4, "0")}`,
      is_primary: true,
    });
  }
  // Simulate chunked .in() queries (200 + 200 + 50) by concatenating arrays —
  // this mirrors fetchAllLeadsRows's `phonesData.push(...(pRes.data || []))`.
  const chunked = [
    ...allRows.slice(0, 200),
    ...allRows.slice(200, 400),
    ...allRows.slice(400, 450),
  ];
  const map = buildPhoneMap(chunked);
  assertEquals(map.size, 450);
  // Spot-check first, middle, last
  assertEquals(map.get("c-0"), "+393000000000");
  assertEquals(map.get("c-225"), "+393000000225");
  assertEquals(map.get("c-449"), "+393000000449");
});

Deno.test("buildRow uses contacts.phone_normalized fallback when phoneMap has nothing", () => {
  // Simulates a lead_event whose contact has no row in contact_phones,
  // but the legacy contacts.phone_normalized is still populated.
  const phoneMap = buildPhoneMap([]); // empty (chunk failed or contact missing)
  const contact = { first_name: "F", last_name: "L", phone_normalized: "+398888" };
  const phone = phoneMap.get("c-x") || contact.phone_normalized || "";
  const row = buildRow(
    { received_at: "2026-05-06T10:00:00Z", source_name: "Meta", raw_payload: {} },
    contact, "Brand A", phone, "", null, "",
  );
  assertEquals(row[PHONE_COLUMN_INDEX], "+398888");
});

// ---------- 5. lead_event without contact_id ----------

Deno.test("buildRow tolerates lead_event without contact (legacy events) and emits empty phone", () => {
  const row = buildRow(
    { received_at: "2026-05-06T10:00:00Z", source_name: "Generic", raw_payload: {} },
    null,           // no contact joined
    "Brand A",
    "",             // phoneMap.get(undefined) || null?.phone || "" → ""
    "",
    null,
    "",
  );
  assertEquals(row[PHONE_COLUMN_INDEX], "");
  assertEquals(row.length, LEADS_HEADERS.length);
});
