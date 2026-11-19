import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const expectedSecret = process.env.VOICE_WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided = req.headers.get("x-webhook-secret");
      if (provided !== expectedSecret) {
        return NextResponse.json({ error: "Invalid webhook secret" }, { status: 401 });
      }
    }

    const body = await req.json();
    const callId = String(body?.call_id || "").trim();
    if (!callId) {
      return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, call: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
