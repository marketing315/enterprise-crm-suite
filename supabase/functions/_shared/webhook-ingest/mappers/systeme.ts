// Systeme.io payload normalizer.
// Detects the nested `{ contact: { fields: [{slug, value}] }, tag: { name } }`
// shape and flattens it so the rest of the pipeline can treat it uniformly.

/**
 * If the payload looks like a Systeme.io webhook (has `contact.fields` array),
 * returns a flattened version with extracted fields and tag info.
 * Returns null otherwise so the caller can fall back to the original payload.
 *
 * Produced metadata keys:
 *   - `_systeme_tag`  → single tag name (when `payload.tag.name` is present)
 *   - `_systeme_tags` → comma-joined tags from `contact.tags[]`
 */
export function tryFlattenSystemeIoPayload(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const contact = payload.contact;
  if (!contact || typeof contact !== "object" || Array.isArray(contact)) return null;
  const contactObj = contact as Record<string, unknown>;

  if (!Array.isArray(contactObj.fields)) return null;

  const flat: Record<string, unknown> = {};

  if (contactObj.email) flat.email = contactObj.email;

  for (const field of contactObj.fields) {
    if (field && typeof field === "object" && !Array.isArray(field)) {
      const f = field as Record<string, unknown>;
      if (f.slug && f.value !== undefined) flat[String(f.slug)] = f.value;
      if (f.fieldName && f.value !== undefined) flat[String(f.fieldName)] = f.value;
    }
  }

  if (payload.tag && typeof payload.tag === "object") {
    const tag = payload.tag as Record<string, unknown>;
    if (tag.name) flat._systeme_tag = tag.name;
  }

  if (Array.isArray(contactObj.tags) && contactObj.tags.length > 0) {
    flat._systeme_tags = contactObj.tags
      .map((t: unknown) => {
        if (t && typeof t === "object") return (t as Record<string, unknown>).name;
        return t;
      })
      .filter(Boolean)
      .join(", ");
  }

  return flat;
}
