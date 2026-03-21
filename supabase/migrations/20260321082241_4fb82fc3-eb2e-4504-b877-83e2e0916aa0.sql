-- Step 1: Add column
ALTER TABLE webhook_sources ADD COLUMN IF NOT EXISTS counts_as_new_lead boolean NOT NULL DEFAULT true;

-- Step 2: Drop and recreate view
DROP VIEW IF EXISTS webhook_sources_safe;
