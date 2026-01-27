-- E2E Test Seed: Create inbound webhook sources for testing
-- This script creates deterministic test sources with known API keys
-- Source 1: ACTIVE (for happy-path tests)
-- Source 2: INACTIVE (for 409 inactive_source test)
--
-- UUIDs used (valid hex):
--   ACTIVE:   aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001
--   INACTIVE: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002
--
-- API Key: e2e-test-api-key-12345
-- SHA-256 hash (verified): e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc

-- Source 1: ACTIVE (UPSERT - safe for re-runs)
INSERT INTO webhook_sources (
  id,
  brand_id,
  name,
  description,
  api_key_hash,
  rate_limit_per_min,
  is_active,
  mapping
) 
SELECT 
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid,
  b.id,
  'E2E Meta Active',
  'Active test source for E2E inbound webhook happy-path tests',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  100,
  true,
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  api_key_hash = EXCLUDED.api_key_hash,
  mapping = EXCLUDED.mapping;

-- Source 2: INACTIVE (UPSERT - safe for re-runs)
INSERT INTO webhook_sources (
  id,
  brand_id,
  name,
  description,
  api_key_hash,
  rate_limit_per_min,
  is_active,
  mapping
) 
SELECT 
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002'::uuid,
  b.id,
  'E2E Meta Inactive',
  'Inactive test source for E2E 409 inactive_source test',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  100,
  false,
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = false,
  api_key_hash = EXCLUDED.api_key_hash,
  mapping = EXCLUDED.mapping;

-- Rate limit buckets (UPSERT)
INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid, 100, 100, 100)
ON CONFLICT (source_id) DO UPDATE SET tokens = 100;

INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002'::uuid, 100, 100, 100)
ON CONFLICT (source_id) DO UPDATE SET tokens = 100;

-- Verify
SELECT id, name, is_active FROM webhook_sources 
WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002'::uuid
);
