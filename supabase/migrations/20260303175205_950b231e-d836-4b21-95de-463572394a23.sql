
-- ============================================================
-- MCP Control Plane – Core Schema  (Step 1)
-- ============================================================

-- 1. Enums
CREATE TYPE public.mcp_tool_category AS ENUM ('read', 'write', 'sensitive_write');
CREATE TYPE public.mcp_policy_action AS ENUM ('allow', 'deny', 'require_approval');
CREATE TYPE public.mcp_execution_status AS ENUM ('pending_approval', 'approved', 'rejected', 'running', 'success', 'failed', 'failed_transient', 'cancelled', 'timeout');
CREATE TYPE public.mcp_server_status AS ENUM ('active', 'disabled', 'degraded', 'maintenance');
CREATE TYPE public.mcp_transport AS ENUM ('stdio', 'streamable_http', 'sse');
CREATE TYPE public.mcp_actor_type AS ENUM ('agent', 'user', 'system', 'cron');
CREATE TYPE public.mcp_approval_decision AS ENUM ('approved', 'rejected', 'expired');

-- 2. mcp_servers
CREATE TABLE public.mcp_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  transport public.mcp_transport NOT NULL DEFAULT 'streamable_http',
  endpoint TEXT,
  status public.mcp_server_status NOT NULL DEFAULT 'active',
  capabilities_json JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  owner_user_id UUID REFERENCES public.users(id),
  kill_switch BOOLEAN NOT NULL DEFAULT false,
  canary_brand_ids UUID[] DEFAULT '{}',
  canary_role_whitelist TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, version)
);

-- 3. mcp_tools
CREATE TABLE public.mcp_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category public.mcp_tool_category NOT NULL DEFAULT 'read',
  input_schema_json JSONB NOT NULL DEFAULT '{}',
  output_schema_json JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  rate_limit_per_min INT DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);

-- 4. mcp_resources
CREATE TABLE public.mcp_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  uri_template TEXT NOT NULL,
  description TEXT,
  schema_json JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, name)
);

-- 5. mcp_policies  (global governance, not per-brand ownership)
CREATE TABLE public.mcp_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  brand_scope UUID,                       -- NULL = all brands
  tool_pattern TEXT NOT NULL DEFAULT '*',  -- glob pattern e.g. 'crm.*'
  action public.mcp_policy_action NOT NULL DEFAULT 'deny',
  priority INT NOT NULL DEFAULT 0,        -- higher = evaluated first
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. mcp_secrets
CREATE TABLE public.mcp_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES public.mcp_servers(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key_name TEXT NOT NULL,
  secret_ref TEXT NOT NULL,               -- vault reference, never plaintext
  active BOOLEAN NOT NULL DEFAULT true,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. mcp_executions  (audit / trace)
CREATE TABLE public.mcp_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL,
  idempotency_key TEXT,
  actor_type public.mcp_actor_type NOT NULL DEFAULT 'agent',
  actor_id UUID,
  brand_id UUID,
  server_id UUID REFERENCES public.mcp_servers(id),
  tool_name TEXT,
  resource_uri TEXT,
  input_redacted JSONB,
  output_redacted JSONB,
  decision public.mcp_policy_action,
  status public.mcp_execution_status NOT NULL DEFAULT 'running',
  latency_ms INT,
  error_code TEXT,
  error_message TEXT,
  policy_id UUID REFERENCES public.mcp_policies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 8. mcp_approvals
CREATE TABLE public.mcp_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id UUID NOT NULL REFERENCES public.mcp_executions(id) ON DELETE CASCADE,
  required_by_policy UUID REFERENCES public.mcp_policies(id),
  approver_user_id UUID REFERENCES public.users(id),
  decision public.mcp_approval_decision,
  reason TEXT,
  decided_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_mcp_tools_server ON public.mcp_tools(server_id);
CREATE INDEX idx_mcp_resources_server ON public.mcp_resources(server_id);
CREATE INDEX idx_mcp_executions_brand ON public.mcp_executions(brand_id, created_at DESC);
CREATE INDEX idx_mcp_executions_request ON public.mcp_executions(request_id);
CREATE INDEX idx_mcp_executions_idempotency ON public.mcp_executions(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_mcp_approvals_pending ON public.mcp_approvals(execution_id) WHERE decision IS NULL;
CREATE INDEX idx_mcp_policies_role ON public.mcp_policies(role, enabled);

-- ============================================================
-- RLS  (admin-only governance tables)
-- ============================================================
ALTER TABLE public.mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_approvals ENABLE ROW LEVEL SECURITY;

-- Admins can read/write all MCP config tables
CREATE POLICY "Admins full access mcp_servers"
  ON public.mcp_servers FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_tools"
  ON public.mcp_tools FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_resources"
  ON public.mcp_resources FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_policies"
  ON public.mcp_policies FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_secrets"
  ON public.mcp_secrets FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_executions"
  ON public.mcp_executions FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

CREATE POLICY "Admins full access mcp_approvals"
  ON public.mcp_approvals FOR ALL TO authenticated
  USING (public.has_role(
    (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid()),
    'admin'
  ));

-- Read-only for authenticated users on catalog tables (servers/tools/resources)
CREATE POLICY "Authenticated read mcp_servers"
  ON public.mcp_servers FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated read mcp_tools"
  ON public.mcp_tools FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated read mcp_resources"
  ON public.mcp_resources FOR SELECT TO authenticated
  USING (true);

-- Users can see their own executions
CREATE POLICY "Users read own executions"
  ON public.mcp_executions FOR SELECT TO authenticated
  USING (
    actor_id = (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid())
  );

-- Approvers can see approvals assigned to them
CREATE POLICY "Approvers read own approvals"
  ON public.mcp_approvals FOR SELECT TO authenticated
  USING (
    approver_user_id = (SELECT u.id FROM public.users u WHERE u.supabase_auth_id = auth.uid())
  );

-- Updated_at trigger for config tables
CREATE TRIGGER update_mcp_servers_updated_at
  BEFORE UPDATE ON public.mcp_servers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mcp_tools_updated_at
  BEFORE UPDATE ON public.mcp_tools
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mcp_resources_updated_at
  BEFORE UPDATE ON public.mcp_resources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_mcp_policies_updated_at
  BEFORE UPDATE ON public.mcp_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
