CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs (tenant_id, created_at DESC);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'tenant_select_audit_logs') THEN
    CREATE POLICY tenant_select_audit_logs ON public.audit_logs FOR SELECT USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'tenant_insert_audit_logs') THEN
    CREATE POLICY tenant_insert_audit_logs ON public.audit_logs FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
  END IF;
END $$;
