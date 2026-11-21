CREATE TABLE IF NOT EXISTS public.voice_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.voice_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_voice_audit_events" ON public.voice_audit_events;
CREATE POLICY "tenant_select_voice_audit_events" ON public.voice_audit_events FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "tenant_insert_voice_audit_events" ON public.voice_audit_events;
CREATE POLICY "tenant_insert_voice_audit_events" ON public.voice_audit_events FOR INSERT WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Append-only: no update or delete policies for authenticated users
-- Deletion/updates only via service-role or trusted admin operations

NOTIFY pgrst, 'reload schema';