import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeWebhookLeadStatus } from "../../../../lib/voiceGuard";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const callId = String(body?.call_id || "").trim();
    if (!callId) {
      return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing Supabase server configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const { data, error } = await supabase
      .from("call_logs")
      .update({
        call_status: body.call_status || "completed",
        duration_seconds: Number(body.duration_seconds || 0),
        transcript: body.transcript || null,
        ai_summary: body.ai_summary || null,
        next_action: body.next_action || null,
      })
      .eq("id", callId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    const leadStatus = sanitizeWebhookLeadStatus(body?.lead_status);
    const leadId = data.lead_id ? String(data.lead_id) : "";

    if (leadId && leadStatus) {
      let leadQuery = supabase.from("leads").update({ status: leadStatus }).eq("id", leadId);
      if (data.tenant_id) {
        leadQuery = leadQuery.eq("tenant_id", String(data.tenant_id));
      }
      const { error: leadError } = await leadQuery.maybeSingle();

      if (leadError) {
        return NextResponse.json({ error: leadError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true, call: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
