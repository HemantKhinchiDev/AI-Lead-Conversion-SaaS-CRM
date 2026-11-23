import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPlivoConfig, normalizePlivoNumber, placePlivoCall } from "../../../../lib/plivo";
import { getVobizConfig, normalizeVobizNumber, placeVobizCall } from "../../../../lib/vobiz";
import { evaluateVoiceEligibility } from "../../../../lib/voiceGuard";
import { analyzeCall, callOutcomeFields } from "../../../../lib/callAnalysis";
import { isPublicHttpUrl } from "../../../../lib/knowledgeBase";

export const runtime = "nodejs";

function resolveVobizAnswerUrl(req: Request): string {
  const configured = process.env.VOBIZ_ANSWER_URL?.trim() ?? "";
  if (isPublicHttpUrl(configured)) {
    return configured;
  }

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (isPublicHttpUrl(baseUrl)) {
    return `${baseUrl.replace(/\/+$/, "")}/api/voice/vobiz-xml`;
  }

  return "";
}

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

    let tenantId = typeof membership?.tenant_id === "string" ? membership.tenant_id : "";
    if (!tenantId) {
      const { data: leadTenant } = await supabase
        .from("leads")
        .select("tenant_id")
        .eq("id", leadId)
        .maybeSingle();
      if (typeof leadTenant?.tenant_id === "string" && leadTenant.tenant_id) {
        tenantId = leadTenant.tenant_id;
      } else {
        const { data: createdTenant } = await supabase
          .from("tenants")
          .insert([{ name: userData.user.email || "Workspace" }])
          .select("id")
          .single();
        tenantId = typeof createdTenant?.id === "string" ? createdTenant.id : "";
      }
      if (tenantId) {
        await supabase.from("users").upsert(
          [{ id: userData.user.id, tenant_id: tenantId, email: userData.user.email }],
          { onConflict: "id" }
        );
      }
    }
    if (!tenantId) {
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

    const vobizConfig = getVobizConfig();
    const vobizDestination = normalizeVobizNumber(lead.phone);
    const vobizAnswerUrl = resolveVobizAnswerUrl(req);

    if (vobizConfig && vobizDestination && vobizAnswerUrl) {
      const dispatch = await placeVobizCall(
        { to: vobizDestination, answerUrl: vobizAnswerUrl },
        { config: { ...vobizConfig, answerUrl: vobizAnswerUrl } }
      );

      if (!dispatch.ok) {
        const { data: failedRow } = await supabase
          .from("call_logs")
          .insert([
            {
              tenant_id: tenantId,
              user_id: userData.user.id,
              lead_id: lead.id,
              provider: "vobiz",
              mode: "live",
              call_status: "failed",
              duration_seconds: 0,
              transcript: null,
              ai_summary: `Vobiz outbound call failed: ${dispatch.error ?? "unknown error"}`,
              next_action: "retry",
            },
          ])
          .select()
          .single();

        return NextResponse.json(
          {
            error: dispatch.error ?? "Vobiz call failed",
            call_id: failedRow?.id ?? null,
            mode: "live",
            provider: "vobiz",
          },
          { status: 502 }
        );
      }

      const providerCallSuffix = dispatch.providerCallId
        ? ` Provider call ID: ${dispatch.providerCallId}`
        : "";
      const { data: callRow, error: insertErr } = await supabase
        .from("call_logs")
        .insert([
          {
            tenant_id: tenantId,
            user_id: userData.user.id,
            lead_id: lead.id,
            provider: "vobiz",
            mode: "live",
            call_status: "queued",
            duration_seconds: 0,
            transcript: null,
            ai_summary: `Outbound AI call queued via Vobiz.${providerCallSuffix}`,
            next_action: "await_webhook",
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
        mode: "live",
        provider: "vobiz",
        provider_call_id: dispatch.providerCallId ?? null,
      });
    }

    const plivoConfig = getPlivoConfig();
    const destination = normalizePlivoNumber(lead.phone);

    if (plivoConfig && destination) {
      const dispatch = await placePlivoCall(
        { to: destination, answerUrl: plivoConfig.answerUrl },
        { config: plivoConfig }
      );

      if (!dispatch.ok) {
        const { data: failedRow } = await supabase
          .from("call_logs")
          .insert([
            {
              tenant_id: tenantId,
              user_id: userData.user.id,
              lead_id: lead.id,
              provider: "plivo",
              mode: "live",
              call_status: "failed",
              duration_seconds: 0,
              transcript: null,
              ai_summary: `Plivo outbound call failed: ${dispatch.error ?? "unknown error"}`,
              next_action: "retry",
            },
          ])
          .select()
          .single();

        return NextResponse.json(
          {
            error: dispatch.error ?? "Plivo call failed",
            call_id: failedRow?.id ?? null,
            mode: "live",
            provider: "plivo",
          },
          { status: 502 }
        );
      }

      const { data: callRow, error: insertErr } = await supabase
        .from("call_logs")
        .insert([
          {
            tenant_id: tenantId,
            user_id: userData.user.id,
            lead_id: lead.id,
            provider: "plivo",
            mode: "live",
            call_status: "queued",
            duration_seconds: 0,
            transcript: null,
            ai_summary: "Outbound AI call queued via Plivo.",
            next_action: "await_webhook",
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
        mode: "live",
        provider: "plivo",
        provider_call_id: dispatch.providerCallId ?? null,
      });
    }

    const sandboxWarning = vobizConfig
      ? "Vobiz is configured but the answer URL or destination is unavailable; used simulated mode."
      : plivoConfig
        ? "Plivo is not configured; used simulated mode."
        : "Vobiz and Plivo are not configured; used simulated mode.";

    const transcript = `AI Agent: Namaste ${lead.full_name}, following up on your recent enquiry. Lead: Yes, I am interested and would like a callback.`;
    const analysis = await analyzeCall(
      { transcript, call_status: "completed", language: "en-IN", lead_name: lead.full_name },
      { groqKey: "" }
    );
    const outcomeFields = callOutcomeFields(analysis);

    const { data: callRow, error: insertErr } = await supabase
      .from("call_logs")
      .insert([
        {
          tenant_id: tenantId,
          user_id: userData.user.id,
          lead_id: lead.id,
          provider: "sandbox_voice_sim",
          mode: "simulated",
          call_status: "completed",
          duration_seconds: 42,
          transcript,
          ...outcomeFields,
          ai_summary: `${outcomeFields.ai_summary} Consent verified.`,
          next_action: "callback",
        },
      ])
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    await supabase
      .from("leads")
      .update({
        status: "contacted",
        updated_at: new Date().toISOString(),
        ...outcomeFields,
      })
      .eq("id", lead.id)
      .eq("tenant_id", tenantId);

    return NextResponse.json({
      call_id: callRow.id,
      status: callRow.call_status,
      call_outcome: outcomeFields.call_outcome,
      callback_datetime: outcomeFields.callback_datetime,
      ai_summary: callRow.ai_summary,
      full_transcript: outcomeFields.full_transcript,
      mode: "sandbox",
      provider: "sandbox_voice_sim",
      warnings: [sandboxWarning],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Voice trigger failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
