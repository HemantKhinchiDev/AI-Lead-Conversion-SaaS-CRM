import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeWebhookLeadStatus } from "../../../../lib/voiceGuard";
import {
  analyzeCall,
  callOutcomeFields,
  sanitizeCallOutcome,
  sanitizeIsoDatetime,
} from "../../../../lib/callAnalysis";

export const runtime = "nodejs";

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

    const { data: existingCall, error: lookupError } = await supabase
      .from("call_logs")
      .select("lead_id, tenant_id, transcript, full_transcript, call_status")
      .eq("id", callId)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existingCall) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }

    const transcript = String(
      body.full_transcript ?? body.transcript ?? existingCall.full_transcript ?? existingCall.transcript ?? ""
    );
    const analysis = await analyzeCall({
      transcript,
      call_status: String(body.call_status ?? existingCall.call_status ?? ""),
    });
    const explicitOutcome = sanitizeCallOutcome(body.call_outcome);
    const fields = callOutcomeFields(analysis);

    if (explicitOutcome) {
      fields.call_outcome = explicitOutcome;
    }
    const explicitCallback = sanitizeIsoDatetime(body.callback_datetime);
    if (explicitCallback) {
      fields.callback_datetime = explicitCallback;
    }
    if (typeof body.ai_summary === "string" && body.ai_summary.trim()) {
      fields.ai_summary = body.ai_summary.trim().slice(0, 500);
    }

    const { data, error } = await supabase
      .from("call_logs")
      .update({
        call_status: body.call_status || "completed",
        duration_seconds: Number(body.duration_seconds || 0),
        transcript: body.transcript || existingCall.transcript || null,
        next_action: body.next_action || null,
        ...fields,
      })
      .eq("id", callId)
      .eq("tenant_id", String(existingCall.tenant_id))
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

    if (leadId) {
      const leadUpdate: Record<string, string | null> = { ...fields };
      if (leadStatus) {
        leadUpdate.status = leadStatus;
      }
      const { error: leadError } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", leadId)
        .eq("tenant_id", String(existingCall.tenant_id));

      if (leadError) {
        return NextResponse.json({ error: leadError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      call: data,
      outcome: fields.call_outcome,
      callback_datetime: fields.callback_datetime,
      ai_summary: fields.ai_summary,
      provider: analysis.provider,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
