// Per-source payload schema validation.
// Pure function. Identical semantics to the original inline implementation.
import type { PayloadSchema, SchemaValidationResult } from "./types.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+\d][\d\s().-]{5,}$/;

export function validatePayloadSchema(
  payload: Record<string, unknown>,
  schema: PayloadSchema | null | undefined,
): SchemaValidationResult {
  if (!schema || typeof schema !== "object") return { valid: true };

  const errors: string[] = [];

  // 1. Required fields
  for (const key of schema.required ?? []) {
    const v = payload[key];
    if (v === undefined || v === null || v === "") {
      errors.push(`required field missing: ${key}`);
    }
  }

  // 2. Field-level rules
  for (const [key, rule] of Object.entries(schema.fields ?? {})) {
    if (!(key in payload)) continue;
    const value = payload[key];
    if (value === null || value === undefined) continue;

    switch (rule.type) {
      case "string":
        if (typeof value !== "string") errors.push(`${key}: expected string`);
        break;
      case "number":
        if (typeof value !== "number" || Number.isNaN(value)) errors.push(`${key}: expected number`);
        break;
      case "boolean":
        if (typeof value !== "boolean") errors.push(`${key}: expected boolean`);
        break;
      case "email":
        if (typeof value !== "string" || !EMAIL_RE.test(value)) errors.push(`${key}: invalid email`);
        break;
      case "phone":
        if (typeof value !== "string" || !PHONE_RE.test(value)) errors.push(`${key}: invalid phone`);
        break;
      case "object":
        if (typeof value !== "object" || Array.isArray(value)) errors.push(`${key}: expected object`);
        break;
      case "array":
        if (!Array.isArray(value)) errors.push(`${key}: expected array`);
        break;
    }

    if (typeof value === "string") {
      if (typeof rule.max_length === "number" && value.length > rule.max_length) {
        errors.push(`${key}: exceeds max_length ${rule.max_length}`);
      }
      if (typeof rule.min_length === "number" && value.length < rule.min_length) {
        errors.push(`${key}: below min_length ${rule.min_length}`);
      }
      if (rule.pattern) {
        try {
          if (!new RegExp(rule.pattern).test(value)) errors.push(`${key}: pattern mismatch`);
        } catch {
          // invalid regex in schema config — ignore silently (legacy behavior)
        }
      }
    }

    if (typeof value === "number") {
      if (typeof rule.min === "number" && value < rule.min) errors.push(`${key}: below min ${rule.min}`);
      if (typeof rule.max === "number" && value > rule.max) errors.push(`${key}: above max ${rule.max}`);
    }
  }

  // 3. Strict mode: reject unknown fields
  if (schema.strict && schema.fields) {
    const known = new Set([...(schema.required ?? []), ...Object.keys(schema.fields)]);
    for (const key of Object.keys(payload)) {
      if (!known.has(key)) errors.push(`unknown field: ${key}`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** GDPR-safe header whitelist — excludes anything that may contain credentials or PII. */
export const HEADER_WHITELIST = [
  "content-type",
  "user-agent",
  "x-forwarded-for",
  "cf-connecting-ip",
  "x-real-ip",
  "origin",
  "accept",
  "accept-language",
];

export function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const key of HEADER_WHITELIST) {
    const value = headers.get(key);
    if (value) filtered[key] = value;
  }
  return filtered;
}

/** Apply field mapping from webhook source config. Unmapped fields are preserved. */
export function applyMapping(
  payload: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [targetField, sourceField] of Object.entries(mapping)) {
    if (sourceField in payload) {
      result[targetField] = payload[sourceField];
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (!Object.values(mapping).includes(key)) {
      result[key] = value;
    }
  }
  return result;
}
