import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

function getSupabase() {
  if (supabaseUrl && supabaseAnonKey) {
    return createClient(supabaseUrl, supabaseAnonKey);
  }
  return null;
}

export interface AuditEvent {
  tenant_id: string;
  action: string;
  resource_type: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  actor_user_id?: string;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const supa = getSupabase();
  if (!supa) {
    return;
  }

  const safeMetadata = {
    ...event.metadata,
    action: event.action,
    resource_type: event.resource_type,
  };

  await supa.from("public.voice_audit_events").insert({
    tenant_id: event.tenant_id,
    action: event.action,
    resource_type: event.resource_type,
    resource_id: event.resource_id,
    metadata: safeMetadata,
    user_id: event.actor_user_id,
  });
}