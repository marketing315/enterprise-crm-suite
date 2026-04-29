
-- ============================================================
-- MCP Server Loop 2 (M2): registry dinamico + resources
-- Additive only: no DROP, no DELETE su tabelle business
-- ============================================================

-- 1) Aggiungo metadati ai tool (nullable + default sicuri)
ALTER TABLE public.mcp_tools
  ADD COLUMN IF NOT EXISTS data_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS max_timeout_ms integer NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS required_scope text NOT NULL DEFAULT 'crm.read';

ALTER TABLE public.mcp_resources
  ADD COLUMN IF NOT EXISTS data_classification text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS required_scope text NOT NULL DEFAULT 'crm.read';

-- 2) Seed server "ralph-crm-mcp" (idempotente per name)
INSERT INTO public.mcp_servers (name, version, transport, endpoint, status, capabilities_json, description, kill_switch)
SELECT 'ralph-crm-mcp', '1.0.0', 'streamable_http',
       '/functions/v1/mcp-server',
       'active'::mcp_server_status,
       jsonb_build_object('tools', jsonb_build_object('listChanged', false),
                          'resources', jsonb_build_object('listChanged', false),
                          'logging', jsonb_build_object()),
       'Ralph CRM MCP server (external clients). Bearer mcp_xxx token required.',
       false
WHERE NOT EXISTS (SELECT 1 FROM public.mcp_servers WHERE name = 'ralph-crm-mcp');

-- 3) Seed tool catalog (idempotente per name)
WITH srv AS (SELECT id FROM public.mcp_servers WHERE name = 'ralph-crm-mcp')
INSERT INTO public.mcp_tools (server_id, name, description, category, input_schema_json, enabled, requires_approval, rate_limit_per_min, data_classification, max_timeout_ms, required_scope)
SELECT srv.id, t.name, t.description, t.category::mcp_tool_category, t.input_schema, true, t.requires_approval, t.rate_limit, t.classification, t.timeout_ms, t.scope
FROM srv,
LATERAL (VALUES
  ('crm.get_contacts',
   'List contacts for the current brand. Filter by status, limit results.',
   'read',
   '{"type":"object","properties":{"status":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":25}}}'::jsonb,
   false, 60, 'internal', 5000, 'crm.read'),
  ('crm.get_deals',
   'List deals for the current brand.',
   'read',
   '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":100,"default":25}}}'::jsonb,
   false, 60, 'internal', 5000, 'crm.read'),
  ('crm.get_tickets',
   'List tickets for the current brand. Filter by status.',
   'read',
   '{"type":"object","properties":{"status":{"type":"string"},"limit":{"type":"integer","minimum":1,"maximum":100,"default":25}}}'::jsonb,
   false, 60, 'internal', 5000, 'crm.read'),
  ('crm.get_appointments',
   'List appointments for the current brand.',
   'read',
   '{"type":"object","properties":{"limit":{"type":"integer","minimum":1,"maximum":100,"default":25}}}'::jsonb,
   false, 60, 'internal', 5000, 'crm.read'),
  ('crm.update_ticket_status',
   'Update the status of a ticket. Requires approval by default.',
   'write',
   '{"type":"object","properties":{"ticket_id":{"type":"string","format":"uuid"},"status":{"type":"string"}},"required":["ticket_id","status"]}'::jsonb,
   true, 30, 'internal', 8000, 'crm.write'),
  ('crm.update_deal_stage',
   'Move a deal to a new pipeline stage. Sensitive write — requires approval.',
   'sensitive_write',
   '{"type":"object","properties":{"deal_id":{"type":"string","format":"uuid"},"stage_id":{"type":"string","format":"uuid"}},"required":["deal_id","stage_id"]}'::jsonb,
   true, 10, 'restricted', 8000, 'crm.write'),
  ('keplero.lookup',
   'Lookup a contact in Keplero by phone or email.',
   'read',
   '{"type":"object","properties":{"phone":{"type":"string"},"email":{"type":"string"}}}'::jsonb,
   false, 30, 'restricted', 10000, 'keplero.read')
) AS t(name, description, category, input_schema, requires_approval, rate_limit, classification, timeout_ms, scope)
WHERE NOT EXISTS (SELECT 1 FROM public.mcp_tools mt WHERE mt.name = t.name);

-- 4) Seed resource templates (idempotente per name)
WITH srv AS (SELECT id FROM public.mcp_servers WHERE name = 'ralph-crm-mcp')
INSERT INTO public.mcp_resources (server_id, name, uri_template, description, schema_json, enabled, data_classification, required_scope)
SELECT srv.id, r.name, r.uri_template, r.description, r.schema_json, true, r.classification, r.scope
FROM srv,
LATERAL (VALUES
  ('contact_record',
   'crm://contacts/{id}',
   'Single contact record by id.',
   '{"type":"object","properties":{"id":{"type":"string","format":"uuid"}},"required":["id"]}'::jsonb,
   'internal', 'crm.read'),
  ('contacts_list',
   'crm://contacts',
   'List of recent contacts (max 20) for the current brand.',
   '{}'::jsonb,
   'internal', 'crm.read'),
  ('deal_record',
   'crm://deals/{id}',
   'Single deal record by id.',
   '{"type":"object","properties":{"id":{"type":"string","format":"uuid"}},"required":["id"]}'::jsonb,
   'internal', 'crm.read'),
  ('appointment_record',
   'crm://appointments/{id}',
   'Single appointment record by id.',
   '{"type":"object","properties":{"id":{"type":"string","format":"uuid"}},"required":["id"]}'::jsonb,
   'internal', 'crm.read')
) AS r(name, uri_template, description, schema_json, classification, scope)
WHERE NOT EXISTS (SELECT 1 FROM public.mcp_resources mr WHERE mr.name = r.name);

-- 5) Seed default policies (idempotente per role + tool_pattern)
INSERT INTO public.mcp_policies (role, brand_scope, tool_pattern, action, priority, description, enabled)
SELECT p.role, NULL, p.tool_pattern, p.action::mcp_policy_action, p.priority, p.description, true
FROM (VALUES
  ('admin', 'crm.*',                'allow',           1000, 'Admin: full CRM access'),
  ('admin', 'keplero.*',            'allow',           1000, 'Admin: Keplero lookup'),
  ('admin', 'resource:crm://*',     'allow',           1000, 'Admin: read CRM resources'),
  ('ceo',   'crm.get_*',            'allow',           900,  'CEO: read-only CRM'),
  ('ceo',   'resource:crm://*',     'allow',           900,  'CEO: read CRM resources'),
  ('sales_manager', 'crm.get_*',    'allow',           800,  'Sales manager: read-only CRM'),
  ('sales_manager', 'crm.update_*', 'require_approval', 800, 'Sales manager: writes need approval'),
  ('sales_manager', 'resource:crm://*', 'allow',       800,  'Sales manager: read CRM resources'),
  ('salesperson',   'crm.get_*',    'allow',           700,  'Salesperson: read-only CRM'),
  ('salesperson',   'resource:crm://*', 'allow',       700,  'Salesperson: read CRM resources'),
  ('*',     'crm.update_deal_stage','require_approval',2000, 'Sensitive write: always require approval'),
  ('*',     'crm.*',                'deny',            10,   'Default deny on CRM writes')
) AS p(role, tool_pattern, action, priority, description)
WHERE NOT EXISTS (
  SELECT 1 FROM public.mcp_policies mp
  WHERE mp.role = p.role AND mp.tool_pattern = p.tool_pattern
);

-- 6) Helper RPC per leggere il catalogo dal server MCP filtrando per scopes
CREATE OR REPLACE FUNCTION public.mcp_list_tools_for_scopes(p_scopes text[])
RETURNS TABLE (
  name text,
  description text,
  input_schema_json jsonb,
  category mcp_tool_category,
  requires_approval boolean,
  rate_limit_per_min integer,
  data_classification text,
  max_timeout_ms integer,
  required_scope text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.name, t.description, t.input_schema_json, t.category,
         t.requires_approval, t.rate_limit_per_min,
         t.data_classification, t.max_timeout_ms, t.required_scope
  FROM public.mcp_tools t
  JOIN public.mcp_servers s ON s.id = t.server_id
  WHERE t.enabled = true
    AND s.kill_switch = false
    AND s.status = 'active'::mcp_server_status
    AND (
      '*' = ANY(p_scopes)
      OR t.required_scope = ANY(p_scopes)
      OR EXISTS (
        SELECT 1 FROM unnest(p_scopes) sc
        WHERE sc LIKE '%*'
          AND t.required_scope LIKE replace(sc, '*', '%')
      )
    )
  ORDER BY t.name
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.mcp_list_resources_for_scopes(p_scopes text[])
RETURNS TABLE (
  name text,
  uri_template text,
  description text,
  schema_json jsonb,
  data_classification text,
  required_scope text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.name, r.uri_template, r.description, r.schema_json,
         r.data_classification, r.required_scope
  FROM public.mcp_resources r
  JOIN public.mcp_servers s ON s.id = r.server_id
  WHERE r.enabled = true
    AND s.kill_switch = false
    AND s.status = 'active'::mcp_server_status
    AND (
      '*' = ANY(p_scopes)
      OR r.required_scope = ANY(p_scopes)
      OR EXISTS (
        SELECT 1 FROM unnest(p_scopes) sc
        WHERE sc LIKE '%*'
          AND r.required_scope LIKE replace(sc, '*', '%')
      )
    )
  ORDER BY r.name
  LIMIT 500;
$$;

GRANT EXECUTE ON FUNCTION public.mcp_list_tools_for_scopes(text[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mcp_list_resources_for_scopes(text[]) TO anon, authenticated, service_role;
