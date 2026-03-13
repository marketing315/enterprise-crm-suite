-- Drop the OLD overload where p_brand_id comes first (causes ambiguity)
DROP FUNCTION IF EXISTS public.dynamic_analytics_query(
  p_brand_id uuid,
  p_dataset text,
  p_metric text,
  p_date_from timestamptz,
  p_date_to timestamptz,
  p_group_by text,
  p_filters jsonb,
  p_limit integer
);