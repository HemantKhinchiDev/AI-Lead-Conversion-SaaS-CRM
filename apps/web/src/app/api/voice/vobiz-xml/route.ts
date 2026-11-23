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
  const speak = `<Speak voice="${escapeXml(input.voice)}">${escapeXml(input.text)}</Speak>`;
  if (input.end || !input.actionUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${speak}<Hangup/></Response>`;
  }

  const audio = input.audioUrl ? `<Play>${escapeXml(input.audioUrl)}</Play>` : speak;
  const prompt = input.prompt
    ? `<Speak voice="${escapeXml(input.voice)}">${escapeXml(input.prompt)}</Speak>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${audio}<GetInput action="${escapeXml(
    input.actionUrl
  )}" method="POST" inputType="dtmf speech" timeout="8" numDigits="1" speechTimeout="auto">${prompt}</GetInput></Response>`;
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

function audioResponse(audioId: string): NextResponse | null {
  const entry = audioCache.get(audioId);
  if (!entry) {
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
  const speech = extractSpeech(payload);
  const digits = extractDigits(payload);
  const turn = Math.max(1, Number.parseInt(getParam(url, payload, "turn") || "1", 10) || 1);
  const ending = isHangupEvent(payload) || digits === "9" || turn > MAX_TURNS;

  let reply: string;
  if (ending) {
    reply =
      readText(context?.knowledgeBase?.closing_script, 500) ||
      "Thank you for your time. Our team will follow up with the confirmed details. Goodbye.";
  } else if (speech && context) {
    const response = await generateVoiceResponse({
      message: speech,
      language,
      knowledgeBase: context.knowledgeBase,
      leadName: context.leadName,
      history: parseHistory(context.transcript),
    });
    reply = response.reply;
  } else if (speech) {
    reply = "Thank you for sharing that. Our team will contact you with the confirmed details.";
  } else {
    reply =
      readText(context?.knowledgeBase?.opening_script, 600) ||
      buildFallbackReply({
        message: "hello",
        language,
        knowledgeBase: context?.knowledgeBase ?? null,
        leadName: context?.leadName ?? "",
      });
  }

  const tts = await synthesizeSpeech(reply, language);
  const audioUrl = tts.audioBase64 ? cacheAudio(tts.audioBase64, baseUrl) : undefined;

  if (context) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    if (supabaseUrl && supabaseKey) {
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const line = speech ? `Customer: ${speech}\nAgent: ${reply}` : `Agent: ${reply}`;
      const transcript = `${context.transcript ? `${context.transcript}\n` : ""}${line}`.slice(
        -MAX_TRANSCRIPT_CHARS
      );
      await supabase
        .from("call_logs")
        .update({ transcript, full_transcript: transcript })
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
      prompt: ending ? undefined : "Please tell me how I can help you.",
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
    return audioResponse(audioId) ?? new NextResponse("Audio not found", { status: 404 });
  }
  return handleAnswer(request, {}, url);
}

export async function POST(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const payload = await readPayload(request);
  const audioId = readText(url.searchParams.get("audio"), 80);
  if (audioId) {
    return audioResponse(audioId) ?? new NextResponse("Audio not found", { status: 404 });
  }
  return handleAnswer(request, payload, url);
}
