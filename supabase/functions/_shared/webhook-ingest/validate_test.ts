import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePayloadSchema, applyMapping, filterHeaders } from "./validate.ts";

Deno.test("validatePayloadSchema: null schema → valid", () => {
  assertEquals(validatePayloadSchema({ foo: 1 }, null), { valid: true });
  assertEquals(validatePayloadSchema({ foo: 1 }, undefined), { valid: true });
});

Deno.test("validatePayloadSchema: required missing", () => {
  const r = validatePayloadSchema({}, { required: ["phone"] });
  assertEquals(r.valid, false);
  if (!r.valid) assert(r.errors[0].includes("phone"));
});

Deno.test("validatePayloadSchema: type checks", () => {
  const schema = {
    fields: {
      name: { type: "string" as const },
      age: { type: "number" as const },
      email: { type: "email" as const },
      phone: { type: "phone" as const },
    },
  };
  const ok = validatePayloadSchema({ name: "x", age: 1, email: "a@b.c", phone: "+39 333 1234567" }, schema);
  assertEquals(ok, { valid: true });

  const bad = validatePayloadSchema({ name: 1, age: "x", email: "nope", phone: "x" }, schema);
  assertEquals(bad.valid, false);
});

Deno.test("validatePayloadSchema: max_length / min", () => {
  const r = validatePayloadSchema(
    { name: "abcdef", age: -1 },
    { fields: { name: { type: "string", max_length: 3 }, age: { type: "number", min: 0 } } },
  );
  assertEquals(r.valid, false);
  if (!r.valid) {
    assert(r.errors.some((e) => e.includes("max_length")));
    assert(r.errors.some((e) => e.includes("below min")));
  }
});

Deno.test("validatePayloadSchema: strict mode rejects unknown", () => {
  const r = validatePayloadSchema(
    { name: "x", extra: 1 },
    { fields: { name: { type: "string" } }, strict: true },
  );
  assertEquals(r.valid, false);
  if (!r.valid) assert(r.errors.some((e) => e.includes("unknown field: extra")));
});

Deno.test("validatePayloadSchema: invalid regex pattern is silently ignored", () => {
  const r = validatePayloadSchema(
    { name: "abc" },
    { fields: { name: { type: "string", pattern: "[invalid(regex" } } },
  );
  assertEquals(r, { valid: true });
});

Deno.test("applyMapping: renames mapped fields and preserves unmapped", () => {
  const mapped = applyMapping(
    { telefono: "333", note: "ciao", extra: 1 },
    { phone: "telefono", notes: "note" },
  );
  assertEquals(mapped.phone, "333");
  assertEquals(mapped.notes, "ciao");
  assertEquals(mapped.extra, 1);
});

Deno.test("filterHeaders: keeps whitelist, drops credentials", () => {
  const h = new Headers({
    "content-type": "application/json",
    "user-agent": "curl/8",
    "authorization": "Bearer secret",
    "x-api-key": "secret",
    "cookie": "sid=abc",
  });
  const f = filterHeaders(h);
  assertEquals(f["content-type"], "application/json");
  assertEquals(f["user-agent"], "curl/8");
  assertEquals(f.authorization, undefined);
  assertEquals(f["x-api-key"], undefined);
  assertEquals(f.cookie, undefined);
});
