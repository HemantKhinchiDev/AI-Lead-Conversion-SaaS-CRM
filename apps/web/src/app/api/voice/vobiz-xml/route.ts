import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { synthesizeSpeech } from "../../../../lib/edgeTts";
import {
  buildFallbackReply,
  generateVoiceResponse,
  normalizeVoiceLanguage,
  sanitizeVoiceHistory,
  VOICE_PROFILES,
  type VoiceKnowledgeBase,
  type VoiceTurn,
} from "../../../../lib/voiceBrain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_TURNS = 8;
const AUDIO_TTL_MS = 5 * 60 * 1000;
const MAX_AUDIO_CACHE_ITEMS = 64;
const MAX_TRANSCRIPT_CHARS = 12000;

type Dict = Record<string, unknown>;

type CallContext = {
  callId: string;
  tenantId: string;
  leadName: string;
  transcript: string;
  knowledgeBase: VoiceKnowledgeBase | null;
};

type VobizXmlInput = {
  text: string;
  voice: string;
  prompt?: string;
  actionUrl?: string;
  audioUrl?: string;
  end?: boolean;
};

const audioCache = new Map<string, { audioBase64: string; expiresAt: number }>();

function isDict(value: unknown): value is Dict {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readText(value: unknown, maxLength = 600): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function resolveBaseUrl(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ?? "";
  if (isHttpUrl(configured)) {
    return configured.replace(/\/+$/, "");
  }
  return new URL(request.url).origin;
}

async function readPayload(request: Request): Promise<Dict> {
  const raw = await request.text();
  if (!raw) {
    return {};
  }

  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (contentType.includes("application/json")) {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isDict(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isDict(parsed)) {
      return parsed;
    }
  } catch {
    return Object.fromEntries(new URLSearchParams(raw));
  }

  return {};
}

function getParam(url: URL, payload: Dict, ...names: string[]): string {
  for (const name of names) {
    const fromQuery = url.searchParams.get(name)?.trim();
    if (fromQuery) {
      return fromQuery.slice(0, 200);
    }
  }
  for (const name of names) {
    const fromPayload = readText(payload[name], 200);
    if (fromPayload) {
      return fromPayload;
    }
  }
  return "";
}


function extractRecordUrl(payload: Dict): string {
  for (const key of [
    "RecordUrl",
    "record_url",
    "RecordingUrl",
    "recording_url",
    "RecordFile",
    "record_file",
    "FileUrl",
    "file_url",
    "AudioUrl",
    "audio_url",
    "url",
  ]) {
    const value = readText(payload[key], 1000);
    if (value && isHttpUrl(value)) {
      return value;
    }
  }
  for (const rawVal of Object.values(payload)) {
    const value = readText(rawVal, 1000);
    if (value && isHttpUrl(value) && /record|audio|mp3|wav|vobiz/i.test(value)) {
      return value;
    }
  }
  return "";
}

async function resolveLatestVobizRecordingUrl(callUuid: string): Promise<string> {
  const authId = process.env.VOBIZ_AUTH_ID?.trim();
  const authToken = process.env.VOBIZ_AUTH_TOKEN?.trim();
  if (!authId || !authToken || !callUuid) {
    return "";
  }
  const endpoint = `https://api.vobiz.ai/api/v1/Account/${encodeURIComponent(
    authId
  )}/Recording/?call_uuid=${encodeURIComponent(callUuid)}&limit=1`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(endpoint, {
        headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          objects?: Array<{ recording_url?: unknown }>;
        };
        const recUrl = readText(json?.objects?.[0]?.recording_url, 1000);
        if (recUrl && isHttpUrl(recUrl)) {
          return recUrl;
        }
      }
    } catch {
      // retry below
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
  }
  return "";
}

async function transcribeRecordingUrl(recordUrl: string, language: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || !recordUrl) {
    return "";
  }
  const authId = process.env.VOBIZ_AUTH_ID?.trim();
  const authToken = process.env.VOBIZ_AUTH_TOKEN?.trim();
  const vobizHeaders: Record<string, string> =
    authId && authToken ? { "X-Auth-ID": authId, "X-Auth-Token": authToken } : {};

  try {
    let audioRes = await fetch(recordUrl, { signal: AbortSignal.timeout(10000) });
    if (!audioRes.ok && Object.keys(vobizHeaders).length > 0) {
      audioRes = await fetch(recordUrl, {
        headers: vobizHeaders,
        signal: AbortSignal.timeout(10000),
      });
    }
    if (!audioRes.ok) {
      return "";
    }
    const arrayBuffer = await audioRes.arrayBuffer();
    if (!arrayBuffer.byteLength) {
      return "";
    }
    const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
    const ext = contentType.includes("wav") ? "wav" : "mp3";
    const form = new FormData();
    form.append("file", new Blob([arrayBuffer], { type: contentType }), `caller.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    if (language === "hi-IN") {
      form.append("language", "hi");
    } else if (language === "gu-IN") {
      form.append("language", "gu");
    }
    form.append("response_format", "json");

    const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(12000),
    });
    if (!sttRes.ok) {
      return "";
    }
    const data = (await sttRes.json()) as { text?: unknown };
    return readText(data?.text, 1000);
  } catch {
    return "";
  }
}

function extractSpeech(payload: Dict): string {
  for (const key of [
    "Speech",
    "speech",
    "SpeechText",
    "speech_text",
    "text",
    "message",
    "user_input",
    "utterance",
    "recognition_text",
  ]) {
    const value = readText(payload[key], 1000);
    if (value) {
      return value;
    }
  }

  const recognition = readText(payload.SpeechRecognition, 4000) || readText(payload.recognition, 4000);
  if (!recognition) {
    return "";
  }
  try {
    const parsed: unknown = JSON.parse(recognition);
    if (isDict(parsed)) {
      for (const key of ["text", "speech", "utterance", "transcript"]) {
        const value = readText(parsed[key], 1000);
        if (value) {
          return value;
        }
      }
    }
  } catch {
    return recognition.slice(0, 1000);
  }
  return "";
}

function extractDigits(payload: Dict): string {
  for (const key of ["Digits", "digits", "dtmf", "DTMF"]) {
    const value = readText(payload[key], 32);
    if (/^\d{1,32}$/.test(value)) {
      return value;
    }
  }
  return "";
}

function isHangupEvent(payload: Dict): boolean {
  const status = readText(payload.CallStatus ?? payload.call_status ?? payload.status, 48).toLowerCase();
  if (
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
    ]).has(status)
  ) {
    return true;
  }
  const event = readText(payload.Event ?? payload.event ?? payload.type, 48).toLowerCase();
  return /hangup|completed|done|ended/.test(event);
}

function parseHistory(transcript: string): VoiceTurn[] {
  const turns: VoiceTurn[] = [];
  for (const line of transcript.split(/\r?\n/).slice(-MAX_TURNS * 2)) {
    const match = /^(AI Agent|Agent|Assistant|Customer|Lead)\s*:\s*(.+)$/i.exec(line.trim());
    if (!match) {
      continue;
    }
    turns.push({
      role: /^(customer|lead)$/i.test(match[1]) ? "customer" : "assistant",
      content: match[2].slice(0, 600),
    });
  }
  return sanitizeVoiceHistory(turns);
}

async function resolveCallContext(url: URL, payload: Dict): Promise<CallContext | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const callId = getParam(url, payload, "call_id", "callId");
  const providerCallId = getParam(
    url,
    payload,
    "CallUUID",
    "call_uuid",
    "RequestUUID",
    "request_uuid",
    "provider_call_id"
  );

  const fields = "id, tenant_id, lead_id, transcript, full_transcript, ai_summary";
  let row: Dict | null = null;

  if (callId) {
    const { data } = await supabase.from("call_logs").select(fields).eq("id", callId).maybeSingle();
    if (isDict(data)) {
      row = data;
    }
  }

  if (!row && providerCallId) {
    const { data } = await supabase
      .from("call_logs")
      .select(fields)
      .eq("provider", "vobiz")
      .ilike("ai_summary", `%${escapeIlike(providerCallId)}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isDict(data)) {
      row = data;
    }
  }

  if (!row) {
    return null;
  }

  const resolvedCallId = String(row.id ?? callId);
  const tenantId = String(row.tenant_id ?? "");
  if (!resolvedCallId || !tenantId) {
    return null;
  }

  let leadName = "";
  if (row.lead_id) {
    const { data: lead } = await supabase
      .from("leads")
      .select("full_name")
      .eq("id", String(row.lead_id))
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (isDict(lead)) {
      leadName = readText(lead.full_name, 120);
    }
  }

  const { data: knowledge } = await supabase
    .from("knowledge_bases")
    .select(
      "business_name, language, business_profile, faqs, opening_script, closing_script, call_goal"
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    callId: resolvedCallId,
    tenantId,
    leadName,
    transcript: readText(row.full_transcript ?? row.transcript, MAX_TRANSCRIPT_CHARS),
    knowledgeBase: isDict(knowledge) ? (knowledge as unknown as VoiceKnowledgeBase) : null,
  };
}

function buildVobizXml(input: VobizXmlInput): string {
  const speak = `<Speak voice="MAN">${escapeXml(input.text)}</Speak>`;
  if (input.end || !input.actionUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${speak}<Hangup/></Response>`;
  }

  const audio = input.audioUrl ? `<Play>${escapeXml(input.audioUrl)}</Play>` : speak;
  const prompt = `<Speak voice="MAN">${escapeXml(input.prompt || input.text)}</Speak>`;
  const digits = `<GetDigits action="${escapeXml(
    input.actionUrl
  )}" method="POST" timeout="8" numDigits="1" validDigits="0123456789#*">${prompt}</GetDigits>`;
  const record = `<Record action="${escapeXml(
    input.actionUrl
  )}" method="POST" maxLength="12" timeout="3" playBeep="true" finishOnKey="#"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${audio}${digits}${record}</Response>`;
}

function xmlResponse(xml: string): NextResponse {
  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

async function audioResponse(audioId: string): Promise<NextResponse | null> {
  const entry = audioCache.get(audioId);
  if (!entry) {
    const bridgeBase = (
      process.env.VPS_EDGE_TTS_URL ||
      "https://father-connectors-insider-event.trycloudflare.com"
    )
      .trim()
      .replace(/\/+$/, "");
    const bridgeSecret = (process.env.TTS_BRIDGE_SECRET || "hmnt_tts_2026").trim();
    if (bridgeBase) {
      try {
        const bridgeUrl = new URL(bridgeBase + "/tts");
        bridgeUrl.searchParams.set("key", bridgeSecret);
        bridgeUrl.searchParams.set("lang", "hi-IN");
        bridgeUrl.searchParams.set(
          "text",
          "Namaste, main aapki sahayata ke liye bol rahi hoon. Kripya batayein main aapki kya madad kar sakti hoon?"
        );
        const upstream = await fetch(bridgeUrl.toString(), {
          method: "GET",
          signal: AbortSignal.timeout(12000),
        });
        if (upstream.ok) {
          const buf = Buffer.from(await upstream.arrayBuffer());
          if (buf.byteLength >= 1000) {
            return new NextResponse(buf, {
              status: 200,
              headers: {
                "Content-Type": "audio/mpeg",
                "Cache-Control": "no-store",
              },
            });
          }
        }
      } catch {
        return null;
      }
    }
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    audioCache.delete(audioId);
    return null;
  }
  const bytes = Uint8Array.from(Buffer.from(entry.audioBase64, "base64"));
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "private, max-age=300",
    },
  });
}

function cacheAudio(audioBase64: string, baseUrl: string): string {
  if (audioCache.size >= MAX_AUDIO_CACHE_ITEMS) {
    const oldest = audioCache.keys().next().value;
    if (oldest) {
      audioCache.delete(oldest);
    }
  }
  const audioId = randomUUID();
  audioCache.set(audioId, { audioBase64, expiresAt: Date.now() + AUDIO_TTL_MS });
  return `${baseUrl}/api/voice/vobiz-xml?audio=${encodeURIComponent(audioId)}`;
}

async function handleAnswer(request: Request, payload: Dict, url: URL): Promise<Response> {
  const context = await resolveCallContext(url, payload);
  const language = normalizeVoiceLanguage(context?.knowledgeBase?.language ?? "en-IN");
  const voice = VOICE_PROFILES[language].voice;
  const baseUrl = resolveBaseUrl(request);
  const turn = Math.max(1, Number.parseInt(getParam(url, payload, "turn") || "1", 10) || 1);
  const callUuid = getParam(url, payload, "CallUUID", "call_uuid", "RequestUUID", "request_uuid");
  const recordUrl =
    extractRecordUrl(payload) ||
    (turn > 1 && callUuid ? await resolveLatestVobizRecordingUrl(callUuid) : "");
  const speech = extractSpeech(payload) || (recordUrl ? await transcribeRecordingUrl(recordUrl, language) : "");
  const digits = extractDigits(payload);
  const silentRetryLimitExceeded = turn >= 5 && !speech && !digits;
  const ending = isHangupEvent(payload) || digits === "9" || turn > MAX_TURNS || silentRetryLimitExceeded;

  let reply: string;
  if (ending) {
    reply =
      readText(context?.knowledgeBase?.closing_script, 500) ||
      "Thank you for your time. Our team will follow up with the confirmed details. Goodbye.";
  } else if (speech) {
    const response = await generateVoiceResponse({
      message: speech,
      language,
      knowledgeBase: context?.knowledgeBase ?? null,
      leadName: context?.leadName ?? "",
      history: parseHistory(context?.transcript ?? ""),
    });
    reply = response.reply;
  } else if (turn === 1) {
    reply =
      readText(context?.knowledgeBase?.opening_script, 600) ||
      buildFallbackReply({
        message: "hello",
        language,
        knowledgeBase: context?.knowledgeBase ?? null,
        leadName: context?.leadName,
      });
  } else {
    reply = "I didn't catch that. Please ask your question after the beep, or press 9 to end the call.";
  }

  let audioUrl: string | undefined;
  if (process.env.ENABLE_EDGE_TTS_VOBIZ !== "0") {
    const tts = await synthesizeSpeech(reply, language);
    if (tts.audioBase64) {
      audioUrl = cacheAudio(tts.audioBase64, baseUrl);
    }
  }

  if (context) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const line = speech ? `Customer: ${speech}\nAgent: ${reply}` : `Agent: ${reply}`;
      const nextTranscript = [context.transcript, line].filter(Boolean).join("\n").slice(-MAX_TRANSCRIPT_CHARS);
      await supabase
        .from("call_logs")
        .update({ transcript: nextTranscript, full_transcript: nextTranscript })
        .eq("id", context.callId)
        .eq("tenant_id", context.tenantId);
    }
  }

  const params = new URLSearchParams();
  if (context) {
    params.set("call_id", context.callId);
  }
  params.set("turn", String(turn + 1));
  const actionUrl = `${baseUrl}/api/voice/vobiz-xml?${params.toString()}`;

  return xmlResponse(
    buildVobizXml({
      text: reply,
      voice,
      prompt: ending ? undefined : "Aapka naam aur business kis cheez ka hai?",
      actionUrl: ending ? undefined : actionUrl,
      audioUrl,
      end: ending,
    })
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const audioId = readText(url.searchParams.get("audio"), 80);
  if (audioId) {
    return (await audioResponse(audioId)) ?? new NextResponse("Audio not found", { status: 404 });
  }
  return handleAnswer(request, {}, url);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const payload = await readPayload(request);
  const audioId = readText(url.searchParams.get("audio"), 80);
  if (audioId) {
    return (await audioResponse(audioId)) ?? new NextResponse("Audio not found", { status: 404 });
  }
  return handleAnswer(request, payload, url);
}
