-- E2E Test Seed: Create inbound webhook source for testing
-- This script creates a deterministic test source with known API key

-- First, clean up any existing test source
DELETE FROM webhook_sources WHERE name = 'E2E Test Meta Source';

-- Create test source with known API key hash
-- API Key: e2e-test-api-key-12345
-- SHA-256 hash: 7c222fb2927d828af22f592134e8932480637c0d6b66e61c9e0caa8af48b62a8
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
  '7c222fb2927d828af22f592134e8932480637c0d6b66e61c9e0caa8af48b62a8',
  100,
  true,
  '{"phone": "telefono", "first_name": "nome", "last_name": "cognome"}'::jsonb
FROM brands b
WHERE b.name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), 'Excell') || '%'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  is_active = true,
  api_key_hash = '7c222fb2927d828af22f592134e8932480637c0d6b66e61c9e0caa8af48b62a8';

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
