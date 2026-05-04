import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tryFlattenSystemeIoPayload } from "./systeme.ts";

Deno.test("systeme: returns null on non-systeme payloads", () => {
  assertEquals(tryFlattenSystemeIoPayload({ phone: "x" }), null);
  assertEquals(tryFlattenSystemeIoPayload({ contact: "string" }), null);
  assertEquals(tryFlattenSystemeIoPayload({ contact: { fields: "not-array" } }), null);
});

Deno.test("systeme: flattens fields by slug and fieldName", () => {
  const flat = tryFlattenSystemeIoPayload({
    contact: {
      email: "a@b.it",
      fields: [
        { slug: "phone_number", value: "3331234567" },
        { fieldName: "Numero di telefono", value: "3331234567" },
        { slug: "first_name", value: "Mario" },
      ],
    },
  });
  assert(flat);
  assertEquals(flat!.email, "a@b.it");
  assertEquals(flat!.phone_number, "3331234567");
  assertEquals(flat!["Numero di telefono"], "3331234567");
  assertEquals(flat!.first_name, "Mario");
});

Deno.test("systeme: extracts top-level tag.name into _systeme_tag", () => {
  const flat = tryFlattenSystemeIoPayload({
    contact: { fields: [{ slug: "x", value: 1 }] },
    tag: { name: "Hot Lead" },
  });
  assertEquals(flat!._systeme_tag, "Hot Lead");
});

Deno.test("systeme: joins contact.tags[] into _systeme_tags", () => {
  const flat = tryFlattenSystemeIoPayload({
    contact: {
      fields: [{ slug: "x", value: 1 }],
      tags: [{ name: "A" }, { name: "B" }, "raw"],
    },
  });
  assertEquals(flat!._systeme_tags, "A, B, raw");
});

Deno.test("systeme: skips field entries missing slug/value", () => {
  const flat = tryFlattenSystemeIoPayload({
    contact: {
      fields: [
        { slug: "ok", value: "v" },
        { slug: "no_value" },
        null,
        "string-entry",
      ],
    },
  });
  assertEquals(flat!.ok, "v");
  assertEquals(flat!.no_value, undefined);
});
