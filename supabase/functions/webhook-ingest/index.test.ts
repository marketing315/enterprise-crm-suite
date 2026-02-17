import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertExists, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/webhook-ingest`;

// Deterministic UUIDs from scripts/seed-e2e-inbound-source.sql
const SOURCE_ACTIVE   = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001";
const SOURCE_INACTIVE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002";
const SOURCE_UNKNOWN  = "00000000-0000-0000-0000-000000000099"; // valid UUID, not seeded
const API_KEY         = "e2e-test-api-key-12345";

// Test 1: Valid webhook creates contact and lead event
Deno.test("M1-01: Valid webhook creates contact", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      nome: "Test",
      cognome: "User01",
      telefono: "+39 345 9999001",
      email: "test01@example.com",
      citta: "Roma",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.success, true);
  assertExists(body.contact_id);
  assertExists(body.lead_event_id);
});

// Test 2: Phone deduplication - same phone returns same contact
Deno.test("M1-02: Phone deduplication works", async () => {
  const response1 = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      nome: "Dedup",
      cognome: "Test",
      telefono: "+39 345 8888002",
      email: "dedup1@example.com",
    }),
  });
  const body1 = await response1.json();
  assertEquals(response1.status, 200);
  const contactId1 = body1.contact_id;

  const response2 = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      nome: "Dedup",
      cognome: "Test2",
      telefono: "3458888002", // Same phone, different format
      email: "dedup2@example.com",
    }),
  });
  const body2 = await response2.json();
  assertEquals(response2.status, 200);

  // Should return same contact
  assertEquals(body2.contact_id, contactId1);
});

// Test 3: Invalid API key is rejected
Deno.test("M1-03: Invalid API key rejected", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "wrong-key",
    },
    body: JSON.stringify({
      nome: "Test",
      telefono: "+39 333 1111111",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 401);
  assertStringIncludes(body.error, "Invalid");
});

// Test 4: Missing credentials returns 401 (B01 - early auth gate)
Deno.test("M1-04: Missing credentials rejected with 401", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Test",
      telefono: "+39 333 2222222",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 401);
  assertStringIncludes(body.error, "Authentication required");
});

// Test 5: Missing phone number is rejected
Deno.test("M1-05: Missing phone number rejected", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_ACTIVE}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify({
      nome: "Test",
      cognome: "NoPhone",
      email: "nophone@example.com",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 400);
  assertStringIncludes(body.error, "Phone number is required");
});

// Test 6: Unknown source (valid UUID) returns 404
Deno.test("M1-06: Unknown source returns 404", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_UNKNOWN}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "any-key",
    },
    body: JSON.stringify({
      nome: "Test",
      telefono: "+39 333 3333333",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 404);
  assertEquals(body.error, "Unknown webhook source");
});

// Test 7: Non-UUID source ID returns 400
Deno.test("M1-07: Non-UUID source ID returns 400", async () => {
  const response = await fetch(`${FUNCTION_URL}/not-a-uuid`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "any-key",
    },
    body: JSON.stringify({
      nome: "Test",
      telefono: "+39 333 4444444",
    }),
  });

  const body = await response.json();

  assertEquals(response.status, 400);
  assertStringIncludes(body.error, "UUID");
});

// Test 8: Missing credentials on unknown UUID still returns 401 (not 404 - prevents enumeration)
Deno.test("M1-08: No credentials on random UUID returns 401 not 404", async () => {
  const response = await fetch(`${FUNCTION_URL}/${SOURCE_UNKNOWN}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      nome: "Test",
      telefono: "+39 333 5555555",
    }),
  });

  const body = await response.json();

  // Must be 401, NOT 404 — prevents source enumeration
  assertEquals(response.status, 401);
});
