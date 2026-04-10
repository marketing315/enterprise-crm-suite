
UPDATE contacts 
SET updated_at = GREATEST(
  created_at, 
  COALESCE(last_interaction_at, created_at)
);
