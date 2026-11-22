-- Phase 2: Universal knowledge base + post-call outcome fields.
-- Safe to re-run: every object is created only when missing.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  business_name text,
  website_url text,
  google_maps_url text,
  call_goal text,
  language text NOT NULL DEFAULT 'en-IN' CHECK (language IN ('hi-IN', 'gu-IN', 'en-IN')),
  business_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  faqs jsonb NOT NULL DEFAULT '[]'::jsonb,
  opening_script text,
  closing_script text,
  custom_script text,
  source_text text,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('draft', 'training', 'ready', 'failed')),
  trained_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_bases_tenant_id_key UNIQUE (tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_bases_tenant ON public.knowledge_bases (tenant_id);

DROP TRIGGER IF EXISTS knowledge_bases_set_updated_at ON public.knowledge_bases;
CREATE TRIGGER knowledge_bases_set_updated_at
  BEFORE UPDATE ON public.knowledge_bases
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.knowledge_bases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_select_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "tenant_select_knowledge_bases"
  ON public.knowledge_bases FOR SELECT
  USING (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant_insert_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "tenant_insert_knowledge_bases"
  ON public.knowledge_bases FOR INSERT
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant_update_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "tenant_update_knowledge_bases"
  ON public.knowledge_bases FOR UPDATE
  USING (tenant_id = public.current_tenant_id())
  WITH CHECK (tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS "tenant_delete_knowledge_bases" ON public.knowledge_bases;
CREATE POLICY "tenant_delete_knowledge_bases"
  ON public.knowledge_bases FOR DELETE
  USING (tenant_id = public.current_tenant_id());

-- Post-call outcome fields on leads.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS callback_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS full_transcript text,
  ADD COLUMN IF NOT EXISTS sheet_id text,
  ADD COLUMN IF NOT EXISTS sheet_row_index integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_call_outcome_check'
      AND conrelid = 'public.leads'::regclass
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_call_outcome_check
      CHECK (
        call_outcome IS NULL
        OR call_outcome IN ('INTERESTED', 'NOT_INTERESTED', 'CALLBACK_REQUESTED', 'NO_ANSWER')
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_sheet
  ON public.leads (tenant_id, sheet_id)
  WHERE sheet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_tenant_outcome
  ON public.leads (tenant_id, call_outcome)
  WHERE call_outcome IS NOT NULL;

-- Post-call outcome fields on call_logs.
ALTER TABLE public.call_logs
  ADD COLUMN IF NOT EXISTS call_outcome text,
  ADD COLUMN IF NOT EXISTS callback_datetime timestamptz,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS full_transcript text,
  ADD COLUMN IF NOT EXISTS sheet_id text,
  ADD COLUMN IF NOT EXISTS sheet_row_index integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'call_logs_call_outcome_check'
      AND conrelid = 'public.call_logs'::regclass
  ) THEN
    ALTER TABLE public.call_logs
      ADD CONSTRAINT call_logs_call_outcome_check
      CHECK (
        call_outcome IS NULL
        OR call_outcome IN ('INTERESTED', 'NOT_INTERESTED', 'CALLBACK_REQUESTED', 'NO_ANSWER')
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_outcome
  ON public.call_logs (tenant_id, call_outcome)
  WHERE call_outcome IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_tenant_sheet
  ON public.call_logs (tenant_id, sheet_id)
  WHERE sheet_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
