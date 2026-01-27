-- E2E Test Seed: Create inbound webhook source for testing
-- This script creates a deterministic test source with known API key

-- First, clean up any existing test source
DELETE FROM webhook_sources WHERE name = 'E2E Test Meta Source';

-- Create test source with known API key hash
-- API Key: e2e-test-api-key-12345
-- SHA-256 hash: e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc
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
  'E2E Test Meta Source',
  'Test source for E2E inbound webhook tests',
  'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc',
  100,
  true,
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  is_active = true,
  api_key_hash = 'e8acc62fa327e65a8c3b2faa19ca2e712246175e2a2698df9583e7e61f4ee2fc';

-- Also create rate limit bucket for this source
INSERT INTO rate_limit_buckets (source_id, tokens, max_tokens, refill_rate)
SELECT 
  'e2e00000-0000-0000-0000-000000000001'::uuid,
  100,
  100,
  100
WHERE EXISTS (SELECT 1 FROM webhook_sources WHERE id = 'e2e00000-0000-0000-0000-000000000001')
ON CONFLICT (source_id) DO UPDATE SET tokens = 100;

-- Verify
SELECT id, name, is_active, rate_limit_per_min FROM webhook_sources WHERE id = 'e2e00000-0000-0000-0000-000000000001';
