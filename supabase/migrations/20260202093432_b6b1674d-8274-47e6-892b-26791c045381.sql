-- M2: Salesperson KPIs + Deal Assignment

-- 1. Add assigned_user_id column to deals
ALTER TABLE deals 
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Create indexes for KPI queries
CREATE INDEX IF NOT EXISTS idx_deals_assigned_kpi 
ON deals(brand_id, assigned_user_id, status, closed_at DESC);

CREATE INDEX IF NOT EXISTS idx_deals_assigned_open 
ON deals(brand_id, assigned_user_id) 
WHERE status IN ('open', 'reopened_for_support');

-- 3. Drop existing SELECT policy and create new one with role-based visibility
DROP POLICY IF EXISTS "Users can view deals in their brands" ON deals;

CREATE POLICY "Users can view deals based on role"
ON deals FOR SELECT
USING (
  user_belongs_to_brand(get_user_id(auth.uid()), brand_id)
  AND (
    -- Admin, CEO, Responsabili vedono tutti i deal del brand
    has_role_for_brand(get_user_id(auth.uid()), brand_id, 'admin')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'ceo')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_venditori')
    OR has_role_for_brand(get_user_id(auth.uid()), brand_id, 'responsabile_callcenter')
    -- Venditori vedono solo deal assegnati a loro o non assegnati
    OR (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'venditore')
      AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL)
    )
    -- Operatori callcenter: stesso pattern
    OR (
      has_role_for_brand(get_user_id(auth.uid()), brand_id, 'operatore_callcenter')
      AND (assigned_user_id = get_user_id(auth.uid()) OR assigned_user_id IS NULL)
    )
  )
);

-- 4. RPC function for salesperson KPIs
CREATE OR REPLACE FUNCTION get_salesperson_kpis(
  p_brand_id UUID,
  p_from TIMESTAMPTZ DEFAULT NULL,
  p_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSON;
  v_from TIMESTAMPTZ;
  v_to TIMESTAMPTZ;
BEGIN
  -- Validate brand access
  IF NOT user_belongs_to_brand(get_user_id(auth.uid()), p_brand_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  
  -- Default to last 30 days if no range
  v_from := COALESCE(p_from, now() - interval '30 days');
  v_to := COALESCE(p_to, now());

  SELECT json_agg(row_to_json(kpi))
  INTO v_result
  FROM (
    SELECT 
      u.id as user_id,
      u.full_name,
      u.email,
      ur.role::text,
      -- Conteggi deal
      COUNT(d.id) FILTER (WHERE d.status = 'open' OR d.status = 'reopened_for_support') as deals_open,
      COUNT(d.id) FILTER (WHERE d.status = 'won' AND d.closed_at >= v_from AND d.closed_at < v_to) as deals_won,
      COUNT(d.id) FILTER (WHERE d.status = 'lost' AND d.closed_at >= v_from AND d.closed_at < v_to) as deals_lost,
      COUNT(d.id) FILTER (WHERE d.status = 'closed' AND d.closed_at >= v_from AND d.closed_at < v_to) as deals_closed,
      -- Valore vinto (won + closed)
      COALESCE(SUM(d.value) FILTER (
        WHERE d.status IN ('won', 'closed') 
        AND d.closed_at >= v_from AND d.closed_at < v_to
      ), 0)::numeric as total_value_won,
      -- Win rate: (won + closed) / totale chiusure con esito
      CASE 
        WHEN COUNT(d.id) FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= v_from AND d.closed_at < v_to) = 0 
        THEN 0
        ELSE ROUND(
          COUNT(d.id) FILTER (WHERE d.status IN ('won', 'closed') AND d.closed_at >= v_from AND d.closed_at < v_to)::numeric * 100 
          / COUNT(d.id) FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= v_from AND d.closed_at < v_to),
          1
        )
      END as win_rate,
      -- Tempo medio chiusura (giorni)
      COALESCE(
        ROUND(
          AVG(EXTRACT(EPOCH FROM (d.closed_at - d.created_at)) / 86400) 
          FILTER (WHERE d.status IN ('won', 'lost', 'closed') AND d.closed_at >= v_from AND d.closed_at < v_to),
          1
        ),
        0
      ) as avg_days_to_close,
      -- Ultima attività
      MAX(d.updated_at) as last_activity_at
    FROM users u
    INNER JOIN user_roles ur ON ur.user_id = u.id 
      AND ur.brand_id = p_brand_id 
      AND ur.role = 'venditore'
      AND ur.is_active = true
    LEFT JOIN deals d ON d.assigned_user_id = u.id 
      AND d.brand_id = p_brand_id
    GROUP BY u.id, u.full_name, u.email, ur.role
    ORDER BY COALESCE(SUM(d.value) FILTER (
        WHERE d.status IN ('won', 'closed') 
        AND d.closed_at >= v_from AND d.closed_at < v_to
      ), 0) DESC, 
      COUNT(d.id) FILTER (WHERE d.status = 'won' AND d.closed_at >= v_from AND d.closed_at < v_to) DESC
  ) kpi;

  RETURN COALESCE(v_result, '[]'::json);
END;
$$;

-- 5. Grant execute permission
GRANT EXECUTE ON FUNCTION get_salesperson_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;