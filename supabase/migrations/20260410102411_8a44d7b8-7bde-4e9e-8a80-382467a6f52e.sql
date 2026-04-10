
UPDATE contact_table_views
SET columns = (
  SELECT jsonb_agg(
    CASE 
      WHEN elem->>'key' = 'sales_total' THEN jsonb_set(elem, '{visible}', 'false')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(columns::jsonb) AS elem
)::json
WHERE name = 'Lead';
