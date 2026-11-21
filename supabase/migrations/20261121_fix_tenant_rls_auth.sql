CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$;

-- Tenant-lead consistency: ensure leads.tenant_id matches user's tenant
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_leads" ON public.leads;
CREATE POLICY "users_select_own_leads"
  ON public.leads FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "users_insert_own_leads" ON public.leads;
CREATE POLICY "users_insert_own_leads"
  ON public.leads FOR INSERT
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "users_update_own_leads" ON public.leads;
CREATE POLICY "users_update_own_leads"
  ON public.leads FOR UPDATE
  USING (tenant_id = public.current_tenant_id());

-- Tenant-scoped call_logs RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own_call_logs" ON public.call_logs;
CREATE POLICY "users_select_own_call_logs"
  ON public.call_logs FOR SELECT
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "users_insert_own_call_logs" ON public.call_logs;
CREATE POLICY "users_insert_own_call_logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "users_update_own_call_logs" ON public.call_logs;
CREATE POLICY "users_update_own_call_logs"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = user_id AND tenant_id = public.current_tenant_id())
  WITH CHECK (auth.uid() = user_id AND tenant_id = public.current_tenant_id());

-- Tenant-scoped users RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_update_own_tenant" ON public.users;
CREATE POLICY "users_update_own_tenant"
  ON public.users FOR UPDATE
  USING (id = auth.uid());

NOTIFY pgrst, 'reload schema';