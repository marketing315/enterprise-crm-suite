-- E2E Test Seed: Create inbound webhook sources for testing
-- This script creates deterministic test sources with known API keys
-- 
-- Sources:
--   ACTIVE:       aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001 (happy-path)
--   INACTIVE:     aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002 (409 test)
--   RATE_LIMITED: aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003 (429 test - 1 req/min)
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
  mapping = EXCLUDED.mapping,
  rate_limit_per_min = EXCLUDED.rate_limit_per_min;

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

-- Source 3: RATE LIMITED (only 1 req/min - for 429 tests)
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
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003'::uuid,
  b.id,
  'E2E Rate Limited',
  'Rate-limited source for E2E 429 rate limit tests (1 req/min)',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  1, -- Only 1 request per minute!
  true,
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  is_active = true,
  api_key_hash = EXCLUDED.api_key_hash,
  mapping = EXCLUDED.mapping,
  rate_limit_per_min = 1; -- Ensure limit is set to 1

-- Rate limit buckets (UPSERT)
INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid, 100, 100, 100)
ON CONFLICT (source_id) DO UPDATE SET tokens = 100, max_tokens = 100, refill_rate = 100;

INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002'::uuid, 100, 100, 100)
ON CONFLICT (source_id) DO UPDATE SET tokens = 100, max_tokens = 100, refill_rate = 100;

-- Rate-limited source: start with 0 tokens to trigger 429 immediately
INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003'::uuid, 0, 1, 1)
ON CONFLICT (source_id) DO UPDATE SET tokens = 0, max_tokens = 1, refill_rate = 1;

-- Verify
SELECT id, name, is_active, rate_limit_per_min FROM webhook_sources 
WHERE id IN (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa001'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa002'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaa003'::uuid
);
