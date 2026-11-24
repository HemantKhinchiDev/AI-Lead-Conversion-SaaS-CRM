import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { synthesizeSpeech } from "../../../../lib/edgeTts";
import {
  detectVoiceLanguage,
  generateVoiceResponse,
  normalizeVoiceLanguage,
  resolveVoice,
  sanitizeVoiceHistory,
  type VoiceKnowledgeBase,
} from "../../../../lib/voiceBrain";
import {
  normalizeAutoLanguageSwitch,
  normalizeOpeningScript,
  normalizeStartingLanguage,
  normalizeVoiceGender,
} from "../../../../lib/voiceSettings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RespondBody = {
  message?: unknown;
  language?: unknown;
  lead_id?: unknown;
  history?: unknown;
  generate_audio?: unknown;
  opening_script?: unknown;
  voice_gender?: unknown;
  starting_language?: unknown;
  auto_language_switch?: unknown;
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

  const body = (await request.json().catch(() => ({}))) as RespondBody;
  const message = readText(body.message, 1000);
  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const requestedLanguage = normalizeVoiceLanguage(body.language);
  const leadId = readText(body.lead_id, 64);
  const history = sanitizeVoiceHistory(body.history);
  const generateAudio = body.generate_audio !== false;
  const voiceSettings = {
    opening_script: normalizeOpeningScript(body.opening_script),
    voice_gender: normalizeVoiceGender(body.voice_gender),
    starting_language: normalizeStartingLanguage(body.starting_language),
    auto_language_switch: normalizeAutoLanguageSwitch(body.auto_language_switch),
  };
  const startingLanguage =
    body.language === undefined
      ? normalizeVoiceLanguage(voiceSettings.starting_language)
      : requestedLanguage;
  const language =
    voiceSettings.auto_language_switch && history.length > 0
      ? detectVoiceLanguage(message, startingLanguage, true)
      : startingLanguage;

  const { data: knowledgeBase, error: knowledgeError } = await supabase
    .from("knowledge_bases")
    .select(
      "business_name, language, business_profile, faqs, opening_script, closing_script, call_goal"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (knowledgeError) {
    return NextResponse.json({ error: knowledgeError.message }, { status: 500 });
  }

  let leadName = "";
  if (leadId) {
    const { data: lead } = await supabase
      .from("leads")
      .select("full_name")
      .eq("id", leadId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    leadName = readText(lead?.full_name, 120);
  }

  const result = await generateVoiceResponse({
    message,
    language,
    knowledgeBase: (knowledgeBase as VoiceKnowledgeBase | null) ?? null,
    leadName,
    history,
  });

  const warnings = [...result.warnings];
  let audioBase64: string | null = null;
  let ttsProvider: "edge-tts" | "unavailable" = "unavailable";

  if (generateAudio) {
    const tts = await synthesizeSpeech(result.reply, language, {
      gender: voiceSettings.voice_gender,
    });
    audioBase64 = tts.audioBase64;
    ttsProvider = tts.provider;
    if (tts.warning) {
      warnings.push(tts.warning);
    }
  }

  return NextResponse.json({
    ok: true,
    reply: result.reply,
    language,
    voice: resolveVoice(language, voiceSettings.voice_gender),
    provider: result.provider,
    grounded: result.grounded,
    audio_base64: audioBase64,
    audio_mime_type: "audio/mpeg",
    tts_provider: ttsProvider,
    warnings,
    voice_settings: voiceSettings,
  });
}
