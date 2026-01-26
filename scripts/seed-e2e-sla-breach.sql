-- E2E Test Seed: Ensure at least 1 ticket has sla_breached_at set
-- This script should be run before E2E tests to ensure deterministic results
-- Usage: Set E2E_BRAND_ID environment variable or replace '<BRAND_ID_TEST>' manually

-- Option 1: Mark an existing active ticket as SLA breached
UPDATE tickets
SET sla_breached_at = now() - interval '10 minutes'
WHERE brand_id = (
  SELECT id FROM brands WHERE name ILIKE '%' || COALESCE(current_setting('app.e2e_brand_name', true), '') || '%' LIMIT 1
)
AND status IN ('open', 'in_progress', 'reopened')
AND sla_breached_at IS NULL
LIMIT 1;

-- Alternative: Direct brand_id approach (uncomment and replace UUID)
-- UPDATE tickets
-- SET sla_breached_at = now() - interval '10 minutes'
-- WHERE brand_id = 'YOUR-BRAND-UUID-HERE'
--   AND status IN ('open', 'in_progress', 'reopened')
--   AND sla_breached_at IS NULL
-- LIMIT 1;

-- Verify the update
SELECT id, title, status, priority, sla_breached_at
FROM tickets
WHERE sla_breached_at IS NOT NULL
  AND status IN ('open', 'in_progress', 'reopened')
ORDER BY sla_breached_at DESC
LIMIT 5;
