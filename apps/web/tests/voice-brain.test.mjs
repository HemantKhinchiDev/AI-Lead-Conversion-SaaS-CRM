import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function read(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

test("voice respond route enforces session auth and tenant-scoped knowledge lookup", () => {
  const route = read("src/app/api/voice/respond/route.ts");
  assert.match(route, /readBearerToken/);
  assert.match(route, /auth\.getUser\(token\)/);
  assert.match(route, /from\("users"\)/);
  assert.match(route, /from\("knowledge_bases"\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /from\("leads"\)/);
  assert.doesNotMatch(route, /body\?\.tenant_id|body\.tenant_id/);
});

test("voice respond route returns grounded multilingual text and generated audio", () => {
  const route = read("src/app/api/voice/respond/route.ts");
  assert.match(route, /normalizeVoiceLanguage\(body\.language\)/);
  assert.match(route, /sanitizeVoiceHistory\(body\.history\)/);
  assert.match(route, /generateVoiceResponse/);
  assert.match(route, /synthesizeSpeech/);
  for (const field of ["reply", "voice", "provider", "grounded", "audio_base64", "tts_provider"]) {
    assert.ok(route.includes(field), `missing response field: ${field}`);
  }
});

test("voice brain supports three Indian languages with local edge-tts voices", () => {
  const lib = read("src/lib/voiceBrain.ts");
  for (const value of ["hi-IN", "gu-IN", "en-IN"]) {
    assert.ok(lib.includes(`"${value}"`), `missing language: ${value}`);
  }
  for (const voice of ["hi-IN-SwaraNeural", "gu-IN-DhwaniNeural", "en-IN-NeerjaNeural"]) {
    assert.ok(lib.includes(voice), `missing voice: ${voice}`);
  }
  assert.match(lib, /llama-3\.3-70b-versatile/);
  assert.match(lib, /Use ONLY the supplied business knowledge base/);
  assert.match(lib, /Never invent prices, availability, appointments, guarantees, or contact details/);
  assert.match(lib, /buildFallbackReply/);
  assert.match(lib, /speak|speech|conversational sentences/);
});

test("edge-tts wiring uses local CLI with python module fallback and no paid speech API", () => {
  const lib = read("src/lib/edgeTts.ts");
  assert.match(lib, /edge-tts/);
  assert.match(lib, /"-m", "edge_tts"/);
  assert.match(lib, /--write-media/);
  assert.match(lib, /mimeType: "audio\/mpeg"/);
  assert.match(lib, /provider: "unavailable"/);
  assert.doesNotMatch(lib, /api\.openai\.com|elevenlabs|api\.groq\.com/);
});

test("plivo bridge reads credentials from env and falls back to the sandbox simulator", () => {
  const lib = read("src/lib/plivo.ts");
  for (const key of ["PLIVO_AUTH_ID", "PLIVO_AUTH_TOKEN", "PLIVO_SOURCE_NUMBER"]) {
    assert.ok(lib.includes(key), `missing env key: ${key}`);
  }
  assert.match(lib, /api\.plivo\.com\/v1\/Account/);
  assert.match(lib, /answer_url/);
  assert.match(lib, /normalizePlivoNumber/);
  assert.match(lib, /Plivo is not configured/);

  const route = read("src/app/api/voice/trigger/route.ts");
  assert.match(route, /evaluateVoiceEligibility/);
  assert.match(route, /getPlivoConfig/);
  assert.match(route, /placePlivoCall/);
  assert.match(route, /provider: "plivo"/);
  assert.match(route, /provider: "sandbox_voice_sim"/);
  assert.match(route, /mode: "simulated"/);
  assert.match(route, /used simulated mode/);
});

test("dashboard exposes the Test AI Voice live demo modal with playback", () => {
  const component = read("src/components/VoiceDemoModal.tsx");
  assert.ok(component.includes("Test AI Voice (Live Demo)"));
  assert.match(component, /\/api\/voice\/respond/);
  assert.match(component, /generate_audio: true/);
  assert.match(component, /audio_base64/);
  assert.match(component, /<audio controls/);
  assert.match(component, /role="dialog"/);
  for (const language of ["en-IN", "hi-IN", "gu-IN"]) {
    assert.ok(component.includes(language), `missing language option: ${language}`);
  }

  const page = read("src/app/dashboard/page.tsx");
  assert.match(page, /import VoiceDemoModal from/);
  assert.match(page, /<VoiceDemoModal \/>/);
});

test("voice files do not contain hardcoded provider secrets", () => {
  const combined = [
    "src/lib/voiceBrain.ts",
    "src/lib/edgeTts.ts",
    "src/lib/plivo.ts",
    "src/app/api/voice/respond/route.ts",
    "src/app/api/voice/trigger/route.ts",
    "src/components/VoiceDemoModal.tsx",
  ]
    .map((path) => read(path))
    .join("\n");
  assert.doesNotMatch(combined, /gsk_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
  assert.doesNotMatch(combined, /MA[0-9a-f]{20,}/);
});
