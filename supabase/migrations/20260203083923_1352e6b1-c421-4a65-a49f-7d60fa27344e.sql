-- Create RPC to get sales totals per contact for a brand
CREATE OR REPLACE FUNCTION public.get_contacts_with_sales_totals(
    p_brand_id UUID
)
RETURNS TABLE (
    contact_id UUID,
    sales_count BIGINT,
    sales_total NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT 
        so.contact_id,
        COUNT(*)::BIGINT as sales_count,
        COALESCE(SUM(so.total_amount), 0) as sales_total
    FROM sales_orders so
    WHERE so.brand_id = p_brand_id
      AND so.status NOT IN ('cancelled')
    GROUP BY so.contact_id;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_contacts_with_sales_totals(UUID) TO authenticated;