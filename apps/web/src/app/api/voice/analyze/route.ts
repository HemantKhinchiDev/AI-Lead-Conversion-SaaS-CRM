import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { analyzeCall, callOutcomeFields } from "../../../../lib/callAnalysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnalyzeBody = {
  call_id?: unknown;
  lead_id?: unknown;
  transcript?: unknown;
  full_transcript?: unknown;
  call_status?: unknown;
  language?: unknown;
};

type CallLogRow = {
  id: string;
  lead_id: string | null;
  transcript: string | null;
  full_transcript: string | null;
  call_status: string | null;
};

function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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

  const body = (await request.json().catch(() => ({}))) as AnalyzeBody;
  const callId = readText(body.call_id, 64);
  const requestedLeadId = readText(body.lead_id, 64);
  if (!callId && !requestedLeadId) {
    return NextResponse.json({ error: "call_id or lead_id is required" }, { status: 400 });
  }

  let callLog: CallLogRow | null = null;

  if (callId) {
    const { data, error } = await supabase
      .from("call_logs")
      .select("id, lead_id, transcript, full_transcript, call_status")
      .eq("id", callId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Call log not found" }, { status: 404 });
    }
    callLog = data as CallLogRow;
  }

  const leadId = requestedLeadId || (callLog?.lead_id ? String(callLog.lead_id) : "");
  if (requestedLeadId && callLog?.lead_id && requestedLeadId !== callLog.lead_id) {
    return NextResponse.json({ error: "Call log not found" }, { status: 404 });
  }

  let leadName = "";
  if (leadId) {
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, full_name")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 });
    }
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }
    leadName = readText(lead.full_name, 120);
  }

  const transcriptSource =
    body.full_transcript ?? body.transcript ?? callLog?.full_transcript ?? callLog?.transcript;
  const callStatus = readText(body.call_status, 60) || callLog?.call_status || "";

  const analysis = await analyzeCall({
    transcript: transcriptSource,
    call_status: callStatus,
    language: body.language,
    lead_name: leadName,
  });
  const fields = callOutcomeFields(analysis);

  if (callLog) {
    const { error: callUpdateError } = await supabase
      .from("call_logs")
      .update(fields)
      .eq("id", callLog.id)
      .eq("tenant_id", tenantId);

    if (callUpdateError) {
      return NextResponse.json({ error: callUpdateError.message }, { status: 500 });
    }
  }

  if (leadId) {
    const { error: leadUpdateError } = await supabase
      .from("leads")
      .update(fields)
      .eq("id", leadId)
      .eq("tenant_id", tenantId);

    if (leadUpdateError) {
      return NextResponse.json({ error: leadUpdateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    call_id: callLog?.id ?? (callId || null),
    lead_id: leadId || null,
    ...fields,
    provider: analysis.provider,
    warnings: analysis.warnings,
  });
}
