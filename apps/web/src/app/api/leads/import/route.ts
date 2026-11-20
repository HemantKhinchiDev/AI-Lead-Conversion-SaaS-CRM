import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseCsvText, prepareBatchImport, type RawImportRow } from "../../../../lib/leadImport";

export const dynamic = "force-dynamic";

function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const token = readBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Invalid user session" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const tenantId = typeof membership?.tenant_id === "string" ? membership.tenant_id : "";
  if (membershipError || !tenantId) {
    return NextResponse.json({ error: "Tenant membership not found" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { csv?: string; rows?: RawImportRow[] };
  const rawRows = Array.isArray(body.rows) ? body.rows : parseCsvText(String(body.csv ?? ""));
  const batch = prepareBatchImport(rawRows, tenantId);

  if (batch.validLeads.length > 0) {
    const dbRows = batch.validLeads.map((l) => ({
      tenant_id: tenantId,
      full_name: l.full_name,
      phone: l.phone_e164,
      consent_given: l.consent_given,
      status: l.status,
    }));
    const { error: insertError } = await supabase.from("leads").insert(dbRows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, summary: batch.counts }, { status: 200 });
}
