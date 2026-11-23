import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sanitizeWebhookLeadStatus } from "../../../../lib/voiceGuard";
import {
  analyzeCall,
  callOutcomeFields,
  sanitizeCallOutcome,
  sanitizeIsoDatetime,
} from "../../../../lib/callAnalysis";
import { pushLeadToSheetSafe, type SheetSyncResult } from "../../../../lib/sheetSync";

export const runtime = "nodejs";

type Dict = Record<string, unknown>;

function readText(value: unknown, maxLength = 600): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function readProviderCallId(payload: Dict): string {
  for (const key of [
    "provider_call_id",
    "CallUUID",
    "call_uuid",
    "RequestUUID",
    "request_uuid",
  ]) {
    const value = readText(payload[key], 120);
    if (value) {
      return value;
    }
  }
  return "";
}

function isVobizEvent(payload: Dict): boolean {
  return Boolean(readProviderCallId(payload)) ||
    /vobiz/i.test(readText(payload.provider, 40)) ||
    readText(payload.Event ?? payload.event, 60).toLowerCase().includes("vobiz");
}

function isVobizHangupEvent(payload: Dict): boolean {
  const status = readText(
    payload.CallStatus ?? payload.call_status ?? payload.status,
    48
  ).toLowerCase();
  const event = readText(payload.Event ?? payload.event ?? payload.type, 48).toLowerCase();
  return (
    new Set([
      "completed",
      "call_completed",
      "hangup",
      "hangup_complete",
      "ended",
      "end",
      "no-answer",
      "no_answer",
      "busy",
      "failed",
    ]).has(status) || /hangup|completed|ended/.test(event)
  );
}

function normalizeCallStatus(payload: Dict): string {
  const status = readText(payload.CallStatus ?? payload.call_status ?? payload.status, 48).toLowerCase();
  if (new Set(["no-answer", "no_answer", "not_answered", "missed"]).has(status)) {
    return "no_answer";
  }
  if (new Set(["hangup", "hangup_complete", "completed", "call_completed", "ended", "end"]).has(status)) {
    return "completed";
  }
  if (new Set(["busy", "failed", "error"]).has(status)) {
    return status === "error" ? "failed" : status;
  }
  return readText(payload.call_status, 48);
}

function readDtmf(payload: Dict): string {
  for (const key of ["Digits", "digits", "dtmf", "DTMF"]) {
    const value = readText(payload[key], 32);
    if (/^\d{1,32}$/.test(value)) {
      return value;
    }
  }
  return "";
}

async function readWebhookPayload(req: Request): Promise<Dict> {
  const raw = await req.text();
  if (!raw) {
    return {};
  }
  const contentType = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Dict;
      }
    } catch {
      return Object.fromEntries(new URLSearchParams(raw));
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function POST(req: Request) {
  try {
    const body = await readWebhookPayload(req);
    const url = new URL(req.url);
    const directCallId = readText(body.call_id) || readText(url.searchParams.get("call_id"));

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing Supabase server configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const callFields =
      "id, lead_id, tenant_id, transcript, full_transcript, call_status, provider, ai_summary";
    const providerCallId = readProviderCallId(body);
    let existingCall: Dict | null = null;
    let lookupError: { message: string } | null = null;

    if (directCallId) {
      const result = await supabase.from("call_logs").select(callFields).eq("id", directCallId).maybeSingle();
      existingCall = result.data as Dict | null;
      lookupError = result.error;
    }

    if (!existingCall && providerCallId) {
      const result = await supabase
        .from("call_logs")
        .select(callFields)
        .eq("provider", "vobiz")
        .ilike("ai_summary", `%${escapeIlike(providerCallId)}%`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingCall = result.data as Dict | null;
      lookupError = result.error;
    }

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!existingCall) {
      return NextResponse.json({ error: "call_id is required" }, { status: 400 });
    }

    const callId = String(existingCall.id ?? directCallId);
    const tenantId = String(existingCall.tenant_id ?? "");
    if (!tenantId) {
      return NextResponse.json({ error: "Tenant membership not found" }, { status: 403 });
    }
    const rawTranscript = String(
      body.full_transcript ??
        body.transcript ??
        existingCall.full_transcript ??
        existingCall.transcript ??
        ""
    );
    const dtmf = readDtmf(body);
    const transcript = dtmf
      ? `${rawTranscript ? `${rawTranscript}\n` : ""}Customer pressed: ${dtmf}`
      : rawTranscript;
    const callStatus =
      normalizeCallStatus(body) || readText(existingCall.call_status) || "completed";
    const analysis = await analyzeCall({
      transcript,
      call_status: callStatus,
      language: readText(body.language),
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

    const vobizEvent = isVobizEvent(body);
    const hangup = isVobizHangupEvent(body);
    const callUpdate: Record<string, unknown> = {
      call_status: callStatus,
      duration_seconds: Number(body.duration_seconds ?? 0),
      transcript: transcript || null,
      next_action: readText(body.next_action, 200) || null,
      ...fields,
    };
    if (vobizEvent) {
      callUpdate.provider = "vobiz";
      if (providerCallId && !readText(existingCall.ai_summary).includes(providerCallId)) {
        callUpdate.ai_summary = `${fields.ai_summary} Provider call ID: ${providerCallId}`.slice(0, 500);
      }
    }

    const { data, error } = await supabase
      .from("call_logs")
      .update(callUpdate)
      .eq("id", callId)
      .eq("tenant_id", tenantId)
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
    let sheetSync: SheetSyncResult = { status: "skipped", reason: "Lead is not linked to a sheet row." };

    if (leadId) {
      const leadUpdate: Record<string, string | null> = { ...fields };
      if (leadStatus) {
        leadUpdate.status = leadStatus;
      }
      const { error: leadError } = await supabase
        .from("leads")
        .update(leadUpdate)
        .eq("id", leadId)
        .eq("tenant_id", tenantId);

      if (leadError) {
        return NextResponse.json({ error: leadError.message }, { status: 500 });
      }

      const { data: updatedLead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (updatedLead) {
        sheetSync = await pushLeadToSheetSafe({
          ...(updatedLead as Record<string, unknown>),
          ...leadUpdate,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      call: data,
      outcome: fields.call_outcome,
      callback_datetime: fields.callback_datetime,
      ai_summary: fields.ai_summary,
      provider: analysis.provider,
      call_provider: vobizEvent ? "vobiz" : readText(existingCall.provider, 40) || null,
      vobiz_event: vobizEvent ? (hangup ? "hangup" : dtmf ? "dtmf" : "status") : null,
      sheet_sync: sheetSync,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Webhook processing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
