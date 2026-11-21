CREATE TABLE IF NOT EXISTS public.call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'sandbox_voice_sim',
  call_status text NOT NULL DEFAULT 'queued',
  duration_seconds integer NOT NULL DEFAULT 0,
  transcript text,
  ai_summary text,
  next_action text,
  estimated_cost_inr numeric(10,2) NOT NULL DEFAULT 0.00,
  mode text NOT NULL DEFAULT 'simulated',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS estimated_cost_inr numeric(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'simulated';

CREATE INDEX IF NOT EXISTS idx_call_logs_lead_id ON public.call_logs(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_user_id ON public.call_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_created ON public.call_logs (tenant_id, created_at DESC);

-- Tenant-lead consistency trigger: ensures call_log.tenant_id matches lead.tenant_id
CREATE OR REPLACE FUNCTION public.ensure_call_log_tenant_consistency()
RETURNS trigger AS $$
BEGIN
  NEW.tenant_id := (SELECT leads.tenant_id FROM public.leads WHERE leads.id = NEW.lead_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_ensure_call_log_tenant_consistency ON public.call_logs;
CREATE TRIGGER trigger_ensure_call_log_tenant_consistency
BEFORE INSERT OR UPDATE ON public.call_logs
FOR EACH ROW EXECUTE FUNCTION public.ensure_call_log_tenant_consistency();

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own call_logs" ON public.call_logs;
CREATE POLICY "Users can view own call_logs"
  ON public.call_logs FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own call_logs" ON public.call_logs;
CREATE POLICY "Users can insert own call_logs"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own call_logs" ON public.call_logs;
CREATE POLICY "Users can update own call_logs"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

NOTIFY pgrst, 'reload schema';