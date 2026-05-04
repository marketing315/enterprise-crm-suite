// Shared types for webhook-ingest pipeline.
// These are the only allowed cross-module types. Modules MUST NOT
// import each other; they only depend on types from this file.

export interface NormalizedPhone {
  normalized: string;
  countryCode: string;
  assumedCountry: boolean;
  raw: string;
}

export interface ExtractedContactData {
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  cap: string | null;
  notes: string | null;
  address: string | null;
}

export interface FieldRule {
  type?: "string" | "number" | "boolean" | "email" | "phone" | "object" | "array";
  max_length?: number;
  min_length?: number;
  min?: number;
  max?: number;
  pattern?: string;
}

export interface PayloadSchema {
  required?: string[];
  fields?: Record<string, FieldRule>;
  strict?: boolean;
}

export type SchemaValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export type DlqReason =
  | "invalid_json"
  | "mapping_error"
  | "missing_required"
  | "schema_validation_failed"
  | "signature_failed"
  | "rate_limited"
  | "ai_extraction_failed"
  | "contact_creation_failed"
  | "unknown_error";
