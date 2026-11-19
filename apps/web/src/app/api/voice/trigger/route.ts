import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, full_name, phone, property_interest, consent_given")
      .eq("id", leadId)
      .single();

    if (leadErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (!lead.consent_given) {
      return NextResponse.json({ error: "Blocked: Explicit consent not verified" }, { status: 403 });
    }

    const webhookUrl = process.env.VOICE_AGENT_WEBHOOK_URL;
    const isSandbox = !webhookUrl;

    const { data: callRow, error: insertErr } = await supabase
      .from("call_logs")
      .insert([
        {
          user_id: userData.user.id,
          lead_id: lead.id,
          provider: isSandbox ? "sandbox_voice_sim" : "vapi_or_n8n",
          call_status: isSandbox ? "completed" : "queued",
          duration_seconds: isSandbox ? 42 : 0,
          transcript: isSandbox
            ? `AI Agent: Namaste ${lead.full_name}, following up on your ${lead.property_interest || "property"} inquiry. Lead: Yes, interested in a site visit this weekend.`
            : null,
          ai_summary: isSandbox
            ? `Consent verified. ${lead.full_name} confirmed interest in ${lead.property_interest || "property"} and requested weekend site visit.`
            : "Outbound AI call queued.",
          next_action: isSandbox ? "site_visit" : "awaiting_webhook",
        },
      ])
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ call_id: callRow.id, lead }),
      }).catch(() => null);
    } else {
      await supabase
        .from("leads")
        .update({ status: "contacted", updated_at: new Date().toISOString() })
        .eq("id", lead.id);
    }

    return NextResponse.json({
      call_id: callRow.id,
      status: callRow.call_status,
      ai_summary: callRow.ai_summary,
      mode: isSandbox ? "sandbox" : "live_webhook",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Voice trigger failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
