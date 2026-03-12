CREATE OR REPLACE FUNCTION public.dynamic_analytics_query(
  p_dataset text,
  p_metric text DEFAULT 'count',
  p_brand_id uuid DEFAULT NULL,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_group_by text DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_query text;
  v_table text;
  v_date_col text;
  v_select_metric text;
  v_select_group text := '';
  v_join text := '';
  v_where text;
  v_group_clause text := '';
  v_order_clause text := '';
  v_key text;
  v_val jsonb;
  v_allowed_filters text[] := ARRAY[
    'status','priority','source_name','lead_type','outcome',
    'appointment_type','call_type','assigned_user_id','created_by_user_id',
    'contact_id','deal_id','assigned_sales_user_id','lead_valid',
    'category_id','cost_center_id','payment_status','campaign_id',
    'periodicity','is_deductible','is_active','vendor_name',
    'from_stage_label','to_stage_label','channel_id'
  ];
  v_allowed_group_bys text[] := ARRAY[
    'status','priority','source_name','lead_type','outcome',
    'appointment_type','call_type','date','week','month',
    'regione','provincia','city',
    'payment_status','category','campaign_name','product_name',
    'from_stage_label','to_stage_label','vendor_name',
    'periodicity','cost_center','channel'
  ];
BEGIN
  CASE p_dataset
    WHEN 'leads' THEN v_table := 'lead_events'; v_date_col := 'received_at';
    WHEN 'contacts' THEN v_table := 'contacts'; v_date_col := 'created_at';
    WHEN 'deals' THEN v_table := 'deals'; v_date_col := 'created_at';
    WHEN 'tickets' THEN v_table := 'tickets'; v_date_col := 'created_at';
    WHEN 'appointments' THEN v_table := 'appointments'; v_date_col := 'scheduled_at';
    WHEN 'calls' THEN v_table := 'call_logs'; v_date_col := 'started_at';
    WHEN 'expenses' THEN v_table := 'expenses'; v_date_col := 'expense_date';
    WHEN 'budgets' THEN v_table := 'budgets'; v_date_col := 'created_at';
    WHEN 'sales_orders' THEN v_table := 'sales_orders'; v_date_col := 'created_at';
    WHEN 'products' THEN v_table := 'products'; v_date_col := 'created_at';
    WHEN 'marketing_campaigns' THEN v_table := 'marketing_campaigns'; v_date_col := 'created_at';
    WHEN 'deal_transitions' THEN v_table := 'deal_stage_transitions'; v_date_col := 'occurred_at';
    ELSE RAISE EXCEPTION 'Invalid dataset: %', p_dataset;
  END CASE;

  CASE p_metric
    WHEN 'count' THEN v_select_metric := 'count(*)::int as metric_value';
    WHEN 'count_distinct_contacts' THEN v_select_metric := 'count(DISTINCT t.contact_id)::int as metric_value';
    WHEN 'sum_value' THEN v_select_metric := 'coalesce(sum(t.value),0)::numeric as metric_value';
    WHEN 'avg_value' THEN v_select_metric := 'coalesce(round(avg(t.value),2),0)::numeric as metric_value';
    WHEN 'sum_lead_cost' THEN v_select_metric := 'coalesce(sum(c.lead_cost),0)::numeric as metric_value';
    WHEN 'sum_amount' THEN v_select_metric := 'coalesce(sum(t.amount),0)::numeric as metric_value';
    WHEN 'sum_planned_amount' THEN v_select_metric := 'coalesce(sum(t.planned_amount),0)::numeric as metric_value';
    WHEN 'sum_total_amount' THEN v_select_metric := 'coalesce(sum(t.total_amount),0)::numeric as metric_value';
    WHEN 'sum_paid_amount' THEN v_select_metric := 'coalesce(sum(t.paid_amount),0)::numeric as metric_value';
    WHEN 'sum_default_price' THEN v_select_metric := 'coalesce(sum(t.default_price),0)::numeric as metric_value';
    WHEN 'avg_amount' THEN v_select_metric := 'coalesce(round(avg(t.amount),2),0)::numeric as metric_value';
    WHEN 'sum_planned_budget' THEN v_select_metric := 'coalesce(sum(t.planned_budget),0)::numeric as metric_value';
    WHEN 'sum_gross_amount' THEN v_select_metric := 'coalesce(sum(t.gross_amount),0)::numeric as metric_value';
    WHEN 'sum_discount_amount' THEN v_select_metric := 'coalesce(sum(t.discount_amount),0)::numeric as metric_value';
    WHEN 'sum_tax_amount' THEN v_select_metric := 'coalesce(sum(t.tax_amount),0)::numeric as metric_value';
    ELSE RAISE EXCEPTION 'Invalid metric: %', p_metric;
  END CASE;

  -- Build WHERE: if system brand (all-brands mode), skip brand filter
  IF p_brand_id = '00000000-0000-0000-0000-000000000000'::uuid THEN
    v_where := 'true';
  ELSE
    v_where := format('t.brand_id = %L', p_brand_id);
  END IF;

  IF p_date_from IS NOT NULL THEN
    v_where := v_where || format(' AND t.%I >= %L', v_date_col, p_date_from);
  END IF;
  IF p_date_to IS NOT NULL THEN
    v_where := v_where || format(' AND t.%I <= %L', v_date_col, p_date_to);
  END IF;

  FOR v_key, v_val IN SELECT * FROM jsonb_each(p_filters) LOOP
    IF NOT (v_key = ANY(v_allowed_filters)) THEN
      RAISE EXCEPTION 'Invalid filter: %', v_key;
    END IF;
    IF jsonb_typeof(v_val) = 'array' THEN
      v_where := v_where || format(' AND t.%I::text = ANY(ARRAY(SELECT jsonb_array_elements_text(%L)))', v_key, v_val);
    ELSE
      v_where := v_where || format(' AND t.%I::text = %L', v_key, v_val #>> '{}');
    END IF;
  END LOOP;

  IF p_group_by IS NOT NULL THEN
    IF NOT (p_group_by = ANY(v_allowed_group_bys)) THEN
      RAISE EXCEPTION 'Invalid group_by: %', p_group_by;
    END IF;

    CASE p_group_by
      WHEN 'date' THEN
        v_select_group := format('t.%I::date as group_key', v_date_col);
        v_group_clause := format('GROUP BY t.%I::date', v_date_col);
        v_order_clause := format('ORDER BY t.%I::date', v_date_col);
      WHEN 'week' THEN
        v_select_group := format('date_trunc(''week'', t.%I)::date as group_key', v_date_col);
        v_group_clause := format('GROUP BY date_trunc(''week'', t.%I)', v_date_col);
        v_order_clause := format('ORDER BY date_trunc(''week'', t.%I)', v_date_col);
      WHEN 'month' THEN
        v_select_group := format('to_char(t.%I, ''YYYY-MM'') as group_key', v_date_col);
        v_group_clause := format('GROUP BY to_char(t.%I, ''YYYY-MM'')', v_date_col);
        v_order_clause := format('ORDER BY to_char(t.%I, ''YYYY-MM'')', v_date_col);
      WHEN 'regione' THEN
        v_join := 'LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'COALESCE(c.province, ''N/D'') as group_key';
        v_group_clause := 'GROUP BY c.province';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'provincia' THEN
        v_join := 'LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'COALESCE(c.province, ''N/D'') as group_key';
        v_group_clause := 'GROUP BY c.province';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'city' THEN
        v_join := 'LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'COALESCE(c.city, ''N/D'') as group_key';
        v_group_clause := 'GROUP BY c.city';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'category' THEN
        v_join := 'LEFT JOIN expense_categories ec ON ec.id = t.category_id';
        v_select_group := 'COALESCE(ec.name, ''Non categorizzata'') as group_key';
        v_group_clause := 'GROUP BY ec.name';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'cost_center' THEN
        v_join := 'LEFT JOIN cost_centers cc ON cc.id = t.cost_center_id';
        v_select_group := 'COALESCE(cc.name, ''Non assegnato'') as group_key';
        v_group_clause := 'GROUP BY cc.name';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'campaign_name' THEN
        -- For leads dataset, use source_name instead of campaign_id join (lead_events has no campaign_id)
        IF p_dataset = 'leads' THEN
          v_select_group := 'COALESCE(t.source_name, ''Sorgente sconosciuta'') as group_key';
          v_group_clause := 'GROUP BY t.source_name';
        ELSE
          v_join := 'LEFT JOIN marketing_campaigns mc ON mc.id = t.campaign_id';
          v_select_group := 'COALESCE(mc.name, ''Nessuna campagna'') as group_key';
          v_group_clause := 'GROUP BY mc.name';
        END IF;
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'product_name' THEN
        v_join := 'LEFT JOIN products p ON p.id = t.product_id';
        v_select_group := 'COALESCE(p.name, ''Nessun prodotto'') as group_key';
        v_group_clause := 'GROUP BY p.name';
        v_order_clause := 'ORDER BY metric_value DESC';
      WHEN 'channel' THEN
        v_join := 'LEFT JOIN marketing_channels mch ON mch.id = t.channel_id';
        v_select_group := 'COALESCE(mch.name, ''Nessun canale'') as group_key';
        v_group_clause := 'GROUP BY mch.name';
        v_order_clause := 'ORDER BY metric_value DESC';
      ELSE
        v_select_group := format('t.%I::text as group_key', p_group_by);
        v_group_clause := format('GROUP BY t.%I', p_group_by);
        v_order_clause := 'ORDER BY metric_value DESC';
    END CASE;
  END IF;

  IF p_group_by IS NOT NULL THEN
    v_query := format(
      'SELECT %s, %s FROM %I t %s WHERE %s %s %s LIMIT %s',
      v_select_group, v_select_metric, v_table, v_join, v_where,
      v_group_clause, v_order_clause, p_limit
    );
  ELSE
    v_query := format(
      'SELECT %s FROM %I t %s WHERE %s',
      v_select_metric, v_table, v_join, v_where
    );
  END IF;

  EXECUTE format('SELECT jsonb_agg(row_to_json(sub)) FROM (%s) sub', v_query) INTO v_result;
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;