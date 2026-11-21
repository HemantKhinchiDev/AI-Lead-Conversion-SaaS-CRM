import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

function createSupabaseClient() {
  if (isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey.length > 0) {
    try {
      return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      });
    } catch {
      return null;
    }
  }
  return null;
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function getCurrentTenant(request: NextRequest) {
  const supa = createSupabaseClient();
  if (!supa) {
    return { tenantId: null, user: null, error: "Auth service unavailable" };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return { tenantId: null, user: null, error: "Missing bearer token", status: 401 };
  }

  const { data: { user }, error: authError } = await supa.auth.getUser(token);

  if (authError || !user) {
    return { tenantId: null, user: null, error: "Invalid token", status: 401 };
  }

  const { data: membership, error: membershipError } = await supa
    .from("public.users")
    .select("tenant_id")
    .eq("id", user.id)
    .single();

  if (membershipError || !membership) {
    return { tenantId: null, user: null, error: "User not enrolled in any tenant", status: 403 };
  }

  return { tenantId: membership.tenant_id, user, error: null };
}

export async function requireTenant(request: NextRequest) {
  const result = await getCurrentTenant(request);
  if (result.error) {
    const headers = new Headers();
    headers.set("WWW-Authenticate", "Bearer");
    headers.append("Content-Type", "application/json");
    throw new Response(JSON.stringify({ error: result.error }), {
      status: result.status,
      headers,
    });
  }
  return result;
}

export function isTenantScoped(resourceTenantId: string, sessionTenantId: string): boolean {
  if (!resourceTenantId || !sessionTenantId) return false;
  return resourceTenantId === sessionTenantId;
}