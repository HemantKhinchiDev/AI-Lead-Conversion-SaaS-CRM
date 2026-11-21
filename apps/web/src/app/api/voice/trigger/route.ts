import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { evaluateVoiceEligibility } from "../../../../lib/voiceGuard";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
    }

    const body = await req.json();
    const leadId = String(body?.lead_id || "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "lead_id is required" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Invalid user session" }, { status: 401 });
    }

    const { data: membership, error: memErr } = await supabase
      .from("users")
      .select("tenant_id")
      .eq("id", userData.user.id)
      .maybeSingle();

    const tenantId = typeof membership?.tenant_id === "string" ? membership.tenant_id : "";
    if (memErr || !tenantId) {
      return NextResponse.json({ error: "Tenant membership not found" }, { status: 403 });
    }

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, tenant_id, full_name, phone, property_interest, consent_given, status")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const guard = evaluateVoiceEligibility(lead, tenantId);
    if (!guard.allowed) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const isSandbox = true;

    const { data: callRow, error: insertErr } = await supabase
      .from("call_logs")
      .insert([
        {
          tenant_id: tenantId,
          user_id: userData.user.id,
          lead_id: lead.id,
          provider: isSandbox ? "sandbox_voice_sim" : "vapi_or_n8n",
          call_status: isSandbox ? "completed" : "queued",
          duration_seconds: isSandbox ? 42 : 0,
          transcript: `AI Agent: Namaste ${lead.full_name}, following up on your ${lead.property_interest || "property"} inquiry. Lead: Yes, interested in a site visit this weekend.`,
          ai_summary: `Consent verified. ${lead.full_name} confirmed interest in ${lead.property_interest || "property"} and requested weekend site visit.`,
          next_action: "site_visit",
        },
      ])
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabase
      .from("leads")
      .update({ status: "contacted", updated_at: new Date().toISOString() })
      .eq("id", lead.id)
      .eq("tenant_id", tenantId);

    return NextResponse.json({
      call_id: callRow.id,
      status: callRow.call_status,
      ai_summary: callRow.ai_summary,
      mode: "sandbox",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Voice trigger failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
