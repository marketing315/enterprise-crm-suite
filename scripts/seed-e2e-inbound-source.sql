-- E2E Test Seed: Create inbound webhook sources for testing
-- This script creates deterministic test sources with known API keys
-- Source 1: ACTIVE (for happy-path tests)
-- Source 2: INACTIVE (for 409 inactive_source test)

-- First, clean up any existing test sources
DELETE FROM webhook_sources WHERE id IN (
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  'e2e00000-0000-0000-0000-000000000002'::uuid
);

-- API Key: e2e-test-api-key-12345
-- SHA-256 hash: e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc

-- Source 1: ACTIVE (for happy-path tests)
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
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  b.id,
  'E2E Test Meta Source (Active)',
  'Active test source for E2E inbound webhook happy-path tests',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  100,
  true,  -- ACTIVE
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1;

-- Source 2: INACTIVE (for 409 test)
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
  'e2e00000-0000-0000-0000-000000000002'::uuid,
  b.id,
  'E2E Test Meta Source (Inactive)',
  'Inactive test source for E2E 409 inactive_source test',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  100,
  false,  -- INACTIVE
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1;

-- Create rate limit buckets for both sources
INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
SELECT 
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  100,
  100,
  100
WHERE EXISTS (SELECT 1 FROM webhook_sources WHERE id = 'e2e00000-0000-0000-0000-000000000001')
ON CONFLICT (source_id) DO UPDATE SET tokens = 100;

INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
SELECT 
  'e2e00000-0000-0000-0000-000000000002'::uuid,
  100,
  100,
  100
WHERE EXISTS (SELECT 1 FROM webhook_sources WHERE id = 'e2e00000-0000-0000-0000-000000000002')
ON CONFLICT (source_id) DO UPDATE SET tokens = 100;

-- Verify both sources
SELECT id, name, is_active, rate_limit_per_min 
FROM webhook_sources 
WHERE id IN (
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  'e2e00000-0000-0000-0000-000000000002'::uuid
);
