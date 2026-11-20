ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS estimated_cost_inr NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.call_logs ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'simulated';
CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_created ON public.call_logs (tenant_id, created_at DESC);
