import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { synthesizeSpeech } from "../../../../lib/edgeTts";
import {
  buildFallbackReply,
  detectVoiceLanguage,
  generateVoiceResponse,
  normalizeVoiceLanguage,
  resolveVoice,
  sanitizeVoiceHistory,
  VOICE_PROFILES,
  type VoiceGender,
  type VoiceKnowledgeBase,
  type VoiceLanguage,
  type VoiceTurn,
} from "../../../../lib/voiceBrain";
import {
  normalizeAutoLanguageSwitch,
  normalizeOpeningScript,
  normalizeVoiceGender,
  normalizeStartingLanguage,
} from "../../../../lib/voiceSettings";

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
  gender?: VoiceGender;
  speakVoice?: "WOMAN" | "MAN";
  prompt?: string;
  actionUrl?: string;
  audioUrl?: string;
  end?: boolean;
};

const audioCache = new Map<string, { bytes: Uint8Array; expiresAt: number }>();

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
      return fromQuery.slice(0, 600);
    }
  }
  for (const name of names) {
    const fromPayload = readText(payload[name], 600);
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
        if (attempt > 0) await new Promise((r) => setTimeout(r, 450));
    try {
      const res = await fetch(endpoint, {
        headers: { "X-Auth-ID": authId, "X-Auth-Token": authToken },
        signal: AbortSignal.timeout(1200),
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
  }
  return "";
}

async function transcribeRecordingUrl(
  recordUrl: string,
  language: string,
  autoDetectLanguage = false
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || !recordUrl) {
    return "";
  }
  const authId = process.env.VOBIZ_AUTH_ID?.trim();
  const authToken = process.env.VOBIZ_AUTH_TOKEN?.trim();
  const vobizHeaders: Record<string, string> =
    authId && authToken ? { "X-Auth-ID": authId, "X-Auth-Token": authToken } : {};

  try {
    let audioRes = await fetch(recordUrl, { signal: AbortSignal.timeout(3500) });
        if (!audioRes.ok && Object.keys(vobizHeaders).length > 0) {
          audioRes = await fetch(recordUrl, {
            headers: vobizHeaders,
            signal: AbortSignal.timeout(3500),
          });
        }
        if (!audioRes.ok) {
          return "";
        }
        const arrayBuffer = await audioRes.arrayBuffer();
        if (!arrayBuffer.byteLength) {
          return "";
        }
        const rawCt = audioRes.headers.get("content-type") || "audio/mpeg";
        const contentType = rawCt.startsWith("audio/") ? rawCt : "audio/mpeg";
        const ext = contentType.includes("wav") ? "wav" : "mp3";
        const form = new FormData();
        form.append("file", new Blob([arrayBuffer], { type: contentType }), `caller.${ext}`);
        form.append("model", "whisper-large-v3-turbo");
        if (language === "hi-IN") {
          form.append("language", "hi");
        } else if (language === "gu-IN") {
          form.append("language", "gu");
        } else if (language === "en-IN") {
          form.append("language", "en");
        }
        form.append("response_format", "json");

        const sttRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
          signal: AbortSignal.timeout(4500),
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
  const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
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

function resolveSpeakVoice(gender: VoiceGender = "female"): "WOMAN" | "MAN" {
  return gender === "male" ? "MAN" : "WOMAN";
}

function buildVobizXml(input: VobizXmlInput): string {
  const speakVoice = input.speakVoice ?? resolveSpeakVoice(input.gender);
  const speak = `<Speak voice="${speakVoice}">${escapeXml(input.text)}</Speak>`;
  if (input.end || !input.actionUrl) {
    const endAudio = input.audioUrl ? `<Play>${escapeXml(input.audioUrl)}</Play>` : speak;
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${endAudio}<Hangup/></Response>`;
  }

  const audio = input.audioUrl ? `<Play>${escapeXml(input.audioUrl)}</Play>` : speak;
  const record = `<Record action="${escapeXml(input.actionUrl)}" method="POST" maxLength="8" timeout="3" retries="0" playBeep="false" finishOnKey="#"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${audio}${record}</Response>`;
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
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    audioCache.delete(audioId);
    return null;
  }
  const bytes = entry.bytes;
  return new NextResponse(bytes as unknown as BodyInit, {
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
  audioCache.set(audioId, { bytes: Uint8Array.from(Buffer.from(audioBase64, "base64")), expiresAt: Date.now() + AUDIO_TTL_MS });
  return `${baseUrl}/api/voice/vobiz-xml?audio=${encodeURIComponent(audioId)}`;
}

function closingReply(language: VoiceLanguage, customScript?: string): string {
  const custom = readText(customScript, 500);
  if (custom) {
    return custom;
  }
  if (language === "hi-IN") {
    return "धन्यवाद। हमारी टीम आपको जल्द कॉल करेगी। अलविदा।";
  }
  if (language === "gu-IN") {
    return "આભાર. અમारी ટીમ તમને જલ્દી કૉલ કરશે. આવજો.";
  }
  return "Thank you for your time. Our team will call you back shortly. Goodbye.";
}

function retryReply(language: VoiceLanguage): string {
  if (language === "hi-IN") {
    return "माफ़ कीजिए, मैं आपकी बात नहीं समझ पाया। कृपया दोबारा बोलें या समाप्त करने के लिए 9 दबाएँ।";
  }
  if (language === "gu-IN") {
    return "માફ કરશો, હું તમને સમજી શક્યો નહીં. કૃપા કરીને ફરીથી બોલો અથવા સમાપ્ત કરવા 9 દબાવો.";
  }
  return "Sorry, I didn't catch that. Please speak again, or press 9 to end the call.";
}

function shouldEndBySpeech(speech: string, turn: number): boolean {
  if (turn < 2) {
    return false;
  }
  const normalized = speech.trim().replace(/[.!]+$/, "").toLowerCase();
  return ["9", "nine", "bye", "goodbye", "stop", "band", "bandh"].includes(normalized);
}

async function handleAnswer(request: Request, payload: Dict, url: URL): Promise<Response> {
  const context = await resolveCallContext(url, payload);
  const baseUrl = resolveBaseUrl(request);
  const turn = Math.max(1, Number.parseInt(getParam(url, payload, "turn") || "1", 10) || 1);

  const requestedLanguage = getParam(url, payload, "starting_language", "language");
  const startingLanguage = requestedLanguage
    ? normalizeStartingLanguage(requestedLanguage)
    : normalizeVoiceLanguage(context?.knowledgeBase?.language ?? "en-IN");
  const voiceGender = normalizeVoiceGender(getParam(url, payload, "voice_gender"));
  const customOpeningScript = normalizeOpeningScript(
    getParam(url, payload, "opening_script", "openingScript")
  );
  const autoSwitchParam = getParam(url, payload, "auto_language_switch", "autoLanguageSwitch");
  const autoLanguageSwitch = autoSwitchParam
    ? normalizeAutoLanguageSwitch(autoSwitchParam)
    : true;

  const callUuid = getParam(url, payload, "CallUUID", "call_uuid", "RequestUUID", "request_uuid");
  const recordUrl =
    extractRecordUrl(payload) ||
    (turn > 1 && callUuid ? await resolveLatestVobizRecordingUrl(callUuid) : "");
  let speech =
    extractSpeech(payload) ||
    (recordUrl
      ? await transcribeRecordingUrl(
          recordUrl,
          startingLanguage,
          turn >= 2 && autoLanguageSwitch
        )
      : "");
  const digits = extractDigits(payload);

  let language: VoiceLanguage = startingLanguage;
  if (turn >= 2 && autoLanguageSwitch && speech) {
    language = detectVoiceLanguage(speech, startingLanguage, true);
  }

  const silentRetryLimitExceeded = turn >= 5 && !speech && !digits;
  const ending =
    isHangupEvent(payload) ||
    digits === "9" ||
    shouldEndBySpeech(speech, turn) ||
    turn > MAX_TURNS ||
    silentRetryLimitExceeded;

  let reply: string;
  if (ending) {
    reply = closingReply(language, context?.knowledgeBase?.closing_script ?? undefined);
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
    const defaultUniversalIntro =
      language === "gu-IN"
        ? voiceGender === "male"
          ? "નમસ્તે, હું હેમંત બોલું છું. હું બિઝનેસ માટે પ્રોફેશનલ વેબસાઇટ્સ, એઆઈ વોઈસ આસિસ્ટન્ટ અને ઓટોમેશન સિસ્ટમ બનાવું છું, જે તમારા કસ્ટમર કોલ્સ અને લીડ્સને ચોવીસ કલાક હેન્ડલ કરે છે. શું તમે અમારી હેલ્પથી તમારા બિઝનેસને ગ્રો કરવા માંગો છો?"
          : "નમસ્તે, હું હેમંતની ટીમમાંથી બોલું છું. અમે બિઝનેસ માટે પ્રોફેશનલ વેબસાઇટ્સ, એઆઈ વોઈસ આસિસ્ટન્ટ અને ઓટોમેશન સિસ્ટમ બનાવીએ છીએ, જે તમારા કસ્ટમર કોલ્સ અને લીડ્સને ચોવીસ કલાક હેન્ડલ કરે છે. શું તમે અમારી હેલ્પથી તમારા બિઝનેસને ગ્રો કરવા માંગો છો?"
        : language === "en-IN"
        ? voiceGender === "male"
          ? "Hello, this is Hemant speaking. I build high-converting websites, AI voice assistants, and smart automation systems that handle your customer calls and leads 24/7. Would you like to grow your business with our help?"
          : "Hello, I’m calling from Hemant’s team. We build high-converting websites, AI voice assistants, and smart automation systems that handle your customer calls and leads 24/7. Would you like to grow your business with our help?"
        : voiceGender === "male"
        ? "नमस्ते, मैं हेमंत बोल रहा हूँ। मैं बिज़नेसेज़ के लिए हाई-कन्वर्टिंग वेबसाइट्स, एआई वॉइस असिस्टेंट और स्मार्ट ऑटोमेशन सिस्टम बनाता हूँ, जो आपकी कस्टमर कॉल्स और लीड्स को चौबीस घंटे हैंडल करते हैं। क्या आप हमारी हेल्प से अपने बिज़नेस को ग्रो करना चाहते हैं?"
        : "नमस्ते, मैं हेमंत की टीम से बोल रही हूँ। हम आपके बिज़नेस की कॉल्स और लीड्स के लिए एआई वॉइस असिस्टेंट बनाते हैं। क्या आप इस बारे में जानना चाहेंगे?";
    reply =
      customOpeningScript ||
      readText(context?.knowledgeBase?.opening_script, 600) ||
      defaultUniversalIntro;
  } else {
    reply = retryReply(language);
  }

  const voice = resolveVoice(language, voiceGender);
  const ttsPromise =
        process.env.ENABLE_EDGE_TTS_VOBIZ !== "0"
          ? synthesizeSpeech(reply, language, { gender: voiceGender })
          : Promise.resolve({ audioBase64: "" });

      const dbPromise = (async () => {
        if (!context) return;
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
        const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim();
        if (!supabaseUrl || !supabaseKey) return;
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
      })();

      void dbPromise;
      const tts = await ttsPromise;
  const rawAudioUrl = tts.audioBase64 ? cacheAudio(tts.audioBase64, baseUrl) : undefined;
      const audioUrl = rawAudioUrl
        ? `${rawAudioUrl}&t=${encodeURIComponent(reply.slice(0, 450))}&l=${encodeURIComponent(language)}&g=${encodeURIComponent(voiceGender)}`
        : undefined;

  const params = new URLSearchParams();
  if (context) {
    params.set("call_id", context.callId);
  }
  params.set("turn", String(turn + 1));
  params.set("starting_language", language);
  params.set("voice_gender", voiceGender);
  params.set("auto_language_switch", autoLanguageSwitch ? "true" : "false");
  if (customOpeningScript) {
    params.set("opening_script", customOpeningScript);
  }
  const actionUrl = `${baseUrl}/api/voice/vobiz-xml?${params.toString()}`;

  return xmlResponse(
    buildVobizXml({
      text: reply,
      voice,
      gender: voiceGender,
      prompt: ending ? undefined : VOICE_PROFILES[language].prompt,
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
