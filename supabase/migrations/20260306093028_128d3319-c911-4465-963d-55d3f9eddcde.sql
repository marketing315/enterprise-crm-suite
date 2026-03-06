-- ============================================
-- 1. Geo functions: CAP → Provincia / Regione
-- ============================================

-- CAP prefix (first 2 digits) → Provincia sigla
CREATE OR REPLACE FUNCTION public.cap_to_provincia(p_cap text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
SELECT CASE substring(p_cap, 1, 2)
  WHEN '00' THEN 'RM' WHEN '01' THEN 'VT' WHEN '02' THEN 'RI' WHEN '03' THEN 'FR' WHEN '04' THEN 'LT'
  WHEN '05' THEN 'TR' WHEN '06' THEN 'PG'
  WHEN '07' THEN 'SS' WHEN '08' THEN 'CA' WHEN '09' THEN 'CA'
  WHEN '10' THEN 'TO' WHEN '11' THEN 'AO' WHEN '12' THEN 'CN' WHEN '13' THEN 'VC' WHEN '14' THEN 'AT' WHEN '15' THEN 'AL'
  WHEN '16' THEN 'GE' WHEN '17' THEN 'SV' WHEN '18' THEN 'IM' WHEN '19' THEN 'SP'
  WHEN '20' THEN 'MI' WHEN '21' THEN 'VA' WHEN '22' THEN 'CO' WHEN '23' THEN 'SO' WHEN '24' THEN 'BG' WHEN '25' THEN 'BS'
  WHEN '26' THEN 'CR' WHEN '27' THEN 'PV' WHEN '28' THEN 'NO' WHEN '29' THEN 'PC'
  WHEN '30' THEN 'VE' WHEN '31' THEN 'TV' WHEN '32' THEN 'BL' WHEN '33' THEN 'UD' WHEN '34' THEN 'TS'
  WHEN '35' THEN 'PD' WHEN '36' THEN 'VI' WHEN '37' THEN 'VR' WHEN '38' THEN 'TN' WHEN '39' THEN 'BZ'
  WHEN '40' THEN 'BO' WHEN '41' THEN 'MO' WHEN '42' THEN 'RE' WHEN '43' THEN 'PR' WHEN '44' THEN 'FE'
  WHEN '45' THEN 'RO' WHEN '46' THEN 'MN' WHEN '47' THEN 'FC' WHEN '48' THEN 'RA'
  WHEN '50' THEN 'FI' WHEN '51' THEN 'PT' WHEN '52' THEN 'AR' WHEN '53' THEN 'SI' WHEN '54' THEN 'MS'
  WHEN '55' THEN 'LU' WHEN '56' THEN 'PI' WHEN '57' THEN 'LI' WHEN '58' THEN 'GR' WHEN '59' THEN 'PO'
  WHEN '60' THEN 'AN' WHEN '61' THEN 'PU' WHEN '62' THEN 'MC' WHEN '63' THEN 'AP'
  WHEN '64' THEN 'TE' WHEN '65' THEN 'PE' WHEN '66' THEN 'CH' WHEN '67' THEN 'AQ'
  WHEN '70' THEN 'BA' WHEN '71' THEN 'FG' WHEN '72' THEN 'BR' WHEN '73' THEN 'LE' WHEN '74' THEN 'TA' WHEN '76' THEN 'BT'
  WHEN '75' THEN 'MT' WHEN '85' THEN 'PZ'
  WHEN '80' THEN 'NA' WHEN '81' THEN 'CE' WHEN '82' THEN 'BN' WHEN '83' THEN 'AV' WHEN '84' THEN 'SA'
  WHEN '86' THEN 'CB'
  WHEN '87' THEN 'CS' WHEN '88' THEN 'CZ' WHEN '89' THEN 'RC'
  WHEN '90' THEN 'PA' WHEN '91' THEN 'TP' WHEN '92' THEN 'AG' WHEN '93' THEN 'CL' WHEN '94' THEN 'EN'
  WHEN '95' THEN 'CT' WHEN '96' THEN 'SR' WHEN '97' THEN 'RG' WHEN '98' THEN 'ME'
  ELSE NULL
END
$$;

-- Provincia sigla → Regione
CREATE OR REPLACE FUNCTION public.provincia_to_regione(p_sigla text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
SELECT CASE p_sigla
  WHEN 'TO' THEN 'Piemonte' WHEN 'VC' THEN 'Piemonte' WHEN 'NO' THEN 'Piemonte' WHEN 'CN' THEN 'Piemonte'
  WHEN 'AT' THEN 'Piemonte' WHEN 'AL' THEN 'Piemonte' WHEN 'BI' THEN 'Piemonte' WHEN 'VB' THEN 'Piemonte'
  WHEN 'AO' THEN 'Valle d''Aosta'
  WHEN 'MI' THEN 'Lombardia' WHEN 'VA' THEN 'Lombardia' WHEN 'CO' THEN 'Lombardia' WHEN 'SO' THEN 'Lombardia'
  WHEN 'BG' THEN 'Lombardia' WHEN 'BS' THEN 'Lombardia' WHEN 'PV' THEN 'Lombardia' WHEN 'CR' THEN 'Lombardia'
  WHEN 'MN' THEN 'Lombardia' WHEN 'LC' THEN 'Lombardia' WHEN 'LO' THEN 'Lombardia' WHEN 'MB' THEN 'Lombardia'
  WHEN 'GE' THEN 'Liguria' WHEN 'SV' THEN 'Liguria' WHEN 'IM' THEN 'Liguria' WHEN 'SP' THEN 'Liguria'
  WHEN 'VR' THEN 'Veneto' WHEN 'VI' THEN 'Veneto' WHEN 'BL' THEN 'Veneto' WHEN 'TV' THEN 'Veneto'
  WHEN 'VE' THEN 'Veneto' WHEN 'PD' THEN 'Veneto' WHEN 'RO' THEN 'Veneto'
  WHEN 'TN' THEN 'Trentino-Alto Adige' WHEN 'BZ' THEN 'Trentino-Alto Adige'
  WHEN 'TS' THEN 'Friuli Venezia Giulia' WHEN 'GO' THEN 'Friuli Venezia Giulia'
  WHEN 'UD' THEN 'Friuli Venezia Giulia' WHEN 'PN' THEN 'Friuli Venezia Giulia'
  WHEN 'PC' THEN 'Emilia-Romagna' WHEN 'PR' THEN 'Emilia-Romagna' WHEN 'RE' THEN 'Emilia-Romagna'
  WHEN 'MO' THEN 'Emilia-Romagna' WHEN 'BO' THEN 'Emilia-Romagna' WHEN 'FE' THEN 'Emilia-Romagna'
  WHEN 'RA' THEN 'Emilia-Romagna' WHEN 'FC' THEN 'Emilia-Romagna' WHEN 'RN' THEN 'Emilia-Romagna'
  WHEN 'FI' THEN 'Toscana' WHEN 'PT' THEN 'Toscana' WHEN 'AR' THEN 'Toscana' WHEN 'SI' THEN 'Toscana'
  WHEN 'MS' THEN 'Toscana' WHEN 'LU' THEN 'Toscana' WHEN 'PI' THEN 'Toscana' WHEN 'LI' THEN 'Toscana'
  WHEN 'GR' THEN 'Toscana' WHEN 'PO' THEN 'Toscana'
  WHEN 'PG' THEN 'Umbria' WHEN 'TR' THEN 'Umbria'
  WHEN 'AN' THEN 'Marche' WHEN 'PU' THEN 'Marche' WHEN 'MC' THEN 'Marche' WHEN 'AP' THEN 'Marche' WHEN 'FM' THEN 'Marche'
  WHEN 'RM' THEN 'Lazio' WHEN 'VT' THEN 'Lazio' WHEN 'RI' THEN 'Lazio' WHEN 'FR' THEN 'Lazio' WHEN 'LT' THEN 'Lazio'
  WHEN 'AQ' THEN 'Abruzzo' WHEN 'TE' THEN 'Abruzzo' WHEN 'PE' THEN 'Abruzzo' WHEN 'CH' THEN 'Abruzzo'
  WHEN 'CB' THEN 'Molise' WHEN 'IS' THEN 'Molise'
  WHEN 'NA' THEN 'Campania' WHEN 'CE' THEN 'Campania' WHEN 'BN' THEN 'Campania' WHEN 'AV' THEN 'Campania' WHEN 'SA' THEN 'Campania'
  WHEN 'BA' THEN 'Puglia' WHEN 'FG' THEN 'Puglia' WHEN 'BR' THEN 'Puglia' WHEN 'LE' THEN 'Puglia' WHEN 'TA' THEN 'Puglia' WHEN 'BT' THEN 'Puglia'
  WHEN 'PZ' THEN 'Basilicata' WHEN 'MT' THEN 'Basilicata'
  WHEN 'CS' THEN 'Calabria' WHEN 'CZ' THEN 'Calabria' WHEN 'RC' THEN 'Calabria' WHEN 'KR' THEN 'Calabria' WHEN 'VV' THEN 'Calabria'
  WHEN 'PA' THEN 'Sicilia' WHEN 'TP' THEN 'Sicilia' WHEN 'AG' THEN 'Sicilia' WHEN 'CL' THEN 'Sicilia'
  WHEN 'EN' THEN 'Sicilia' WHEN 'CT' THEN 'Sicilia' WHEN 'SR' THEN 'Sicilia' WHEN 'RG' THEN 'Sicilia' WHEN 'ME' THEN 'Sicilia'
  WHEN 'SS' THEN 'Sardegna' WHEN 'NU' THEN 'Sardegna' WHEN 'CA' THEN 'Sardegna' WHEN 'OR' THEN 'Sardegna' WHEN 'OT' THEN 'Sardegna' WHEN 'CI' THEN 'Sardegna' WHEN 'VS' THEN 'Sardegna' WHEN 'OG' THEN 'Sardegna'
  ELSE NULL
END
$$;

-- Composite: CAP → Regione
CREATE OR REPLACE FUNCTION public.cap_to_regione(p_cap text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT provincia_to_regione(cap_to_provincia(p_cap))
$$;

-- ============================================
-- 2. Dynamic analytics query RPC (SECURITY DEFINER, whitelisted)
-- ============================================

CREATE OR REPLACE FUNCTION public.dynamic_analytics_query(
  p_brand_id uuid,
  p_dataset text,
  p_metric text DEFAULT 'count',
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
  v_allowed_filters text[] := ARRAY['status','priority','source_name','lead_type','outcome','appointment_type','call_type','assigned_user_id','created_by_user_id','contact_id','deal_id','assigned_sales_user_id','lead_valid'];
  v_allowed_group_bys text[] := ARRAY['status','priority','source_name','lead_type','outcome','appointment_type','call_type','date','week','month','regione','provincia','city'];
BEGIN
  -- Validate dataset (whitelist)
  CASE p_dataset
    WHEN 'leads' THEN v_table := 'lead_events'; v_date_col := 'received_at';
    WHEN 'contacts' THEN v_table := 'contacts'; v_date_col := 'created_at';
    WHEN 'deals' THEN v_table := 'deals'; v_date_col := 'created_at';
    WHEN 'tickets' THEN v_table := 'tickets'; v_date_col := 'created_at';
    WHEN 'appointments' THEN v_table := 'appointments'; v_date_col := 'scheduled_at';
    WHEN 'calls' THEN v_table := 'call_logs'; v_date_col := 'started_at';
    ELSE RAISE EXCEPTION 'Invalid dataset: %', p_dataset;
  END CASE;

  -- Validate metric
  CASE p_metric
    WHEN 'count' THEN v_select_metric := 'count(*)::int as metric_value';
    WHEN 'count_distinct_contacts' THEN v_select_metric := 'count(DISTINCT t.contact_id)::int as metric_value';
    WHEN 'sum_value' THEN v_select_metric := 'coalesce(sum(t.value),0)::numeric as metric_value';
    WHEN 'avg_value' THEN v_select_metric := 'coalesce(round(avg(t.value),2),0)::numeric as metric_value';
    WHEN 'sum_lead_cost' THEN v_select_metric := 'coalesce(sum(c.lead_cost),0)::numeric as metric_value';
    ELSE RAISE EXCEPTION 'Invalid metric: %', p_metric;
  END CASE;

  -- Build WHERE
  v_where := format('t.brand_id = %L', p_brand_id);
  IF p_date_from IS NOT NULL THEN
    v_where := v_where || format(' AND t.%I >= %L', v_date_col, p_date_from);
  END IF;
  IF p_date_to IS NOT NULL THEN
    v_where := v_where || format(' AND t.%I <= %L', v_date_col, p_date_to);
  END IF;

  -- Process filters
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

  -- Build GROUP BY + JOIN
  IF p_group_by IS NOT NULL THEN
    IF NOT (p_group_by = ANY(v_allowed_group_bys)) THEN
      RAISE EXCEPTION 'Invalid group_by: %', p_group_by;
    END IF;

    IF p_group_by = 'regione' THEN
      IF p_dataset = 'contacts' THEN
        v_select_group := 'cap_to_regione(t.cap) as group_key, ';
      ELSE
        v_join := ' LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'cap_to_regione(c.cap) as group_key, ';
      END IF;
    ELSIF p_group_by = 'provincia' THEN
      IF p_dataset = 'contacts' THEN
        v_select_group := 'cap_to_provincia(t.cap) as group_key, ';
      ELSE
        v_join := ' LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'cap_to_provincia(c.cap) as group_key, ';
      END IF;
    ELSIF p_group_by = 'city' THEN
      IF p_dataset = 'contacts' THEN
        v_select_group := 'lower(trim(t.city)) as group_key, ';
      ELSE
        v_join := ' LEFT JOIN contacts c ON c.id = t.contact_id';
        v_select_group := 'lower(trim(c.city)) as group_key, ';
      END IF;
    ELSIF p_group_by = 'date' THEN
      v_select_group := format('date_trunc(''day'', t.%I)::date::text as group_key, ', v_date_col);
    ELSIF p_group_by = 'week' THEN
      v_select_group := format('date_trunc(''week'', t.%I)::date::text as group_key, ', v_date_col);
    ELSIF p_group_by = 'month' THEN
      v_select_group := format('date_trunc(''month'', t.%I)::date::text as group_key, ', v_date_col);
    ELSE
      v_select_group := format('t.%I::text as group_key, ', p_group_by);
    END IF;
    v_group_clause := ' GROUP BY group_key';
    v_order_clause := ' ORDER BY metric_value DESC';
  END IF;

  -- Need contact join for sum_lead_cost on non-contacts datasets
  IF p_metric = 'sum_lead_cost' AND p_dataset != 'contacts' AND v_join = '' THEN
    v_join := ' LEFT JOIN contacts c ON c.id = t.contact_id';
  END IF;

  -- Build & execute
  v_query := format(
    'SELECT coalesce(jsonb_agg(row_to_json(sub)), ''[]''::jsonb) FROM (SELECT %s%s FROM %I t%s WHERE %s%s%s LIMIT %s) sub',
    v_select_group, v_select_metric, v_table, v_join, v_where, v_group_clause, v_order_clause, p_limit
  );

  EXECUTE v_query INTO v_result;
  RETURN coalesce(v_result, '[]'::jsonb);
END;
$$;

-- Grant execute to authenticated
GRANT EXECUTE ON FUNCTION public.cap_to_provincia(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provincia_to_regione(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cap_to_regione(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dynamic_analytics_query(uuid, text, text, timestamptz, timestamptz, text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dynamic_analytics_query(uuid, text, text, timestamptz, timestamptz, text, jsonb, int) TO service_role;