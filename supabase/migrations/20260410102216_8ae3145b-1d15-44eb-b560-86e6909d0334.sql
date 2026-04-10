
-- Fix saved views: add lead_score and last_interaction_at columns, remove updated_at visibility
-- Update all contact_table_views to inject missing columns
UPDATE contact_table_views
SET columns = (
  SELECT jsonb_agg(
    CASE 
      WHEN elem->>'key' = 'updated_at' THEN jsonb_set(elem, '{visible}', 'false')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(columns::jsonb) AS elem
)::json
WHERE columns::text NOT LIKE '%last_interaction_at%';

-- Now add lead_score at position 0 and last_interaction_at at the end for views missing them
UPDATE contact_table_views
SET columns = (
  jsonb_build_array(
    '{"key":"lead_score","label":"Lead Score","visible":true}'::jsonb
  ) || (columns::jsonb) || jsonb_build_array(
    '{"key":"last_interaction_at","label":"Ultima interazione","visible":true}'::jsonb
  )
)::json
WHERE columns::text NOT LIKE '%lead_score%';

-- For views that have lead_score but not last_interaction_at
UPDATE contact_table_views
SET columns = (
  (columns::jsonb) || jsonb_build_array(
    '{"key":"last_interaction_at","label":"Ultima interazione","visible":true}'::jsonb
  )
)::json
WHERE columns::text LIKE '%lead_score%' AND columns::text NOT LIKE '%last_interaction_at%';

-- Fix updated_at for views that already have both but updated_at is still visible
UPDATE contact_table_views
SET columns = (
  SELECT jsonb_agg(
    CASE 
      WHEN elem->>'key' = 'updated_at' THEN jsonb_set(elem, '{visible}', 'false')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(columns::jsonb) AS elem
)::json
WHERE columns::text LIKE '%last_interaction_at%' 
  AND columns::text LIKE '%"key":"updated_at"%'
  AND columns::text LIKE '%"visible":true%';

-- Fix corrupted updated_at: reset to GREATEST of meaningful timestamps
UPDATE contacts 
SET updated_at = GREATEST(
  created_at, 
  COALESCE(last_interaction_at, created_at),
  COALESCE(lead_score_updated_at, created_at)
);
