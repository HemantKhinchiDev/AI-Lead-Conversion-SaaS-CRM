import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function source(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

const VOBIZ_LIB = "src/lib/vobiz.ts";
const TRIGGER_ROUTE = "src/app/api/voice/trigger/route.ts";
const XML_ROUTE = "src/app/api/voice/vobiz-xml/route.ts";
const WEBHOOK_ROUTE = "src/app/api/voice/webhook/route.ts";

test("vobiz client reads server-side env credentials and normalizes destinations", () => {
  const lib = source(VOBIZ_LIB);
  for (const key of ["VOBIZ_AUTH_ID", "VOBIZ_AUTH_TOKEN", "VOBIZ_FROM_NUMBER", "VOBIZ_ANSWER_URL"]) {
    assert.ok(lib.includes(key), `missing env key: ${key}`);
  }
  assert.match(lib, /api\.vobiz\.ai\/api\/v1\/Account/);
  assert.match(lib, /"X-Auth-ID": config\.authId/);
  assert.match(lib, /"X-Auth-Token": config\.authToken/);
  assert.match(lib, /answer_url: answerUrl/);
  assert.match(lib, /answer_method: "POST"/);
  assert.match(lib, /getVobizConfig\(env: NodeJS\.ProcessEnv = process\.env\)/);
  assert.match(lib, /export function normalizeVobizNumber/);
  assert.ok(lib.includes("/^\\+?\\d{8,15}$/"), "missing destination phone validation");
  assert.match(lib, /return `\+91\$\{digits\}`/);
  assert.match(lib, /digits\.startsWith\("0"\)/);
  assert.match(lib, /return `\+\$\{digits\}`/);
  assert.doesNotMatch(lib, /NEXT_PUBLIC_VOBIZ/);
});

test("vobiz client fails safely on missing config, invalid numbers, provider errors, and timeouts", () => {
  const lib = source(VOBIZ_LIB);
  assert.match(lib, /Vobiz is not configured/);
  assert.match(lib, /Destination phone number is not valid for Vobiz/);
  assert.match(lib, /Vobiz answer URL is not configured/);
  assert.match(lib, /Vobiz call failed \(HTTP \$\{status\}\)/);
  assert.match(lib, /readProviderCallId/);
  assert.match(lib, /request_uuid/);
  assert.match(lib, /new AbortController\(\)/);
  assert.match(lib, /clearTimeout\(timer\)/);
  assert.match(lib, /deps\.fetchImpl \?\? fetch/);
});

test("vobiz outbound trigger keeps consent gating and tenant isolation before provider dispatch", () => {
  const route = source(TRIGGER_ROUTE);
  assert.match(route, /auth\.getUser\(\)/);
  assert.match(route, /from\("users"\)/);
  assert.match(route, /select\("tenant_id"\)/);
  assert.match(route, /\.eq\("id", leadId\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /evaluateVoiceEligibility\(lead, tenantId\)/);
  assert.match(route, /guard\.allowed/);
  assert.match(route, /status: 401/);
  assert.match(route, /status: 403/);
  assert.match(route, /status: 404/);
  assert.doesNotMatch(route, /body\?\.tenant_id|body\.tenant_id/);

  const guardIndex = route.indexOf("evaluateVoiceEligibility(lead, tenantId)");
  const providerIndex = route.indexOf("getVobizConfig()");
  assert.ok(guardIndex > -1 && providerIndex > guardIndex, "consent guard must run before dispatch");
});

test("vobiz outbound trigger logs provider call ids and preserves simulated fallback", () => {
  const route = source(TRIGGER_ROUTE);
  assert.match(route, /getVobizConfig\(\)/);
  assert.match(route, /normalizeVobizNumber\(lead\.phone\)/);
  assert.match(route, /resolveVobizAnswerUrl\(req\)/);
  assert.match(route, /\/api\/voice\/vobiz-xml/);
  assert.match(route, /placeVobizCall\(/);
  assert.match(route, /provider: "vobiz"/);
  assert.match(route, /mode: "live"/);
  assert.match(route, /call_status: "queued"/);
  assert.match(route, /call_status: "failed"/);
  assert.match(route, /next_action: "await_webhook"/);
  assert.match(route, /provider_call_id: dispatch\.providerCallId \?\? null/);
  assert.match(route, /status: 502/);
  assert.match(route, /getPlivoConfig\(\)/);
  assert.match(route, /provider: "sandbox_voice_sim"/);
  assert.match(route, /mode: "simulated"/);
  assert.match(route, /used simulated mode/);
});

test("vobiz xml endpoint returns escaped, bounded VobizXML with TTS and input collection", () => {
  const route = source(XML_ROUTE);
  assert.match(route, /function buildVobizXml/);
  assert.match(route, /<Speak voice=/);
  assert.match(route, /<GetInput action=/);
  assert.match(route, /inputType="dtmf speech"/);
  assert.match(route, /method="POST"/);
  assert.match(route, /numDigits="1"/);
  assert.match(route, /speechTimeout="auto"/);
  assert.match(route, /<Hangup\/>/);
  assert.match(route, /function escapeXml/);
  assert.match(route, /application\/xml; charset=utf-8/);
  assert.match(route, /"Cache-Control": "no-store"/);
  assert.match(route, /MAX_TURNS = 8/);
  assert.match(route, /digits === "9"/);
  assert.match(route, /isHangupEvent\(payload\)/);
});

test("vobiz xml endpoint grounds responses in tenant knowledge and caches edge-tts audio locally", () => {
  const route = source(XML_ROUTE);
  assert.match(route, /generateVoiceResponse\(/);
  assert.match(route, /synthesizeSpeech\(reply, language\)/);
  assert.match(route, /normalizeVoiceLanguage\(/);
  assert.match(route, /VOICE_PROFILES\[language\]\.voice/);
  assert.match(route, /buildFallbackReply\(/);
  assert.match(route, /from\("knowledge_bases"\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /from\("leads"\)/);
  assert.match(route, /from\("call_logs"\)/);
  assert.match(route, /\.eq\("id", context\.callId\)/);
  assert.match(route, /\.eq\("tenant_id", context\.tenantId\)/);
  assert.match(route, /escapeIlike/);
  assert.match(route, /cacheAudio\(/);
  assert.match(route, /audio\/mpeg/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /application\/x-www-form-urlencoded/);
  assert.match(route, /"Audio not found", \{ status: 404 \}/);
});

test("webhook handles vobiz status, DTMF and hangup events with tenant-scoped updates", () => {
  const route = source(WEBHOOK_ROUTE);
  assert.match(route, /readWebhookPayload\(req\)/);
  assert.match(route, /isVobizEvent\(body\)/);
  assert.match(route, /isVobizHangupEvent\(body\)/);
  assert.match(route, /readProviderCallId\(body\)/);
  assert.match(route, /readDtmf\(body\)/);
  assert.match(route, /Customer pressed: \$\{dtmf\}/);
  assert.match(route, /\.eq\("provider", "vobiz"\)/);
  assert.match(route, /\.ilike\("ai_summary"/);
  assert.match(route, /callUpdate\.provider = "vobiz"/);
  assert.match(route, /Provider call ID: \$\{providerCallId\}/);
  assert.match(route, /\.eq\("id", callId\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /call_provider: vobizEvent/);
  assert.match(route, /hangup \? "hangup" : dtmf \? "dtmf" : "status"/);
  assert.match(route, /sanitizeCallOutcome/);
  assert.match(route, /sanitizeIsoDatetime/);
  assert.match(route, /analyzeCall\(/);
  assert.match(route, /pushLeadToSheetSafe\(/);
  assert.match(route, /call_id is required/);
  assert.match(route, /status: 400/);
});

test("vobiz bridge files contain no hardcoded provider secrets", () => {
  const combined = [VOBIZ_LIB, TRIGGER_ROUTE, XML_ROUTE, WEBHOOK_ROUTE]
    .map((path) => source(path))
    .join("\n");
  assert.doesNotMatch(combined, /gsk_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(combined, /MA[0-9a-f]{20,}/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
  assert.doesNotMatch(combined, /NEXT_PUBLIC_VOBIZ_(AUTH_ID|AUTH_TOKEN)/);
});
