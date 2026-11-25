import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function read(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

let voiceBrainPromise;
function loadVoiceBrain() {
  if (!voiceBrainPromise) {
    voiceBrainPromise = (async () => {
      const dir = mkdtempSync(join(tmpdir(), "voice-brain-"));
      for (const [sourcePath, outputName] of [
        ["src/lib/knowledgeBase.ts", "knowledgeBase.mjs"],
        ["src/lib/voiceBrain.ts", "voiceBrain.mjs"],
      ]) {
        let js = ts.transpileModule(read(sourcePath), {
          compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText;
        js = js.replace('from "./knowledgeBase"', 'from "./knowledgeBase.mjs"');
        writeFileSync(join(dir, outputName), js, "utf8");
      }
      try {
        return await import(pathToFileURL(join(dir, "voiceBrain.mjs")).href);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  }
  return voiceBrainPromise;
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
  for (const voice of [
    "hi-IN-SwaraNeural",
    "hi-IN-MadhurNeural",
    "gu-IN-DhwaniNeural",
    "gu-IN-NiranjanNeural",
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
  ]) {
    assert.ok(lib.includes(voice), `missing voice: ${voice}`);
  }
  assert.match(lib, /qwen\/qwen3\.8-27b/);
    assert.match(lib, /GROQ_TIMEOUT_MS = 2000/);
  assert.match(lib, /resolveGroqModel\(\)/);
  assert.match(lib, /Use ONLY the supplied business knowledge base/);
  assert.match(lib, /Never invent prices, availability, appointments, guarantees, or contact details/);
  assert.match(lib, /buildFallbackReply/);
  assert.match(lib, /speak|speech|conversational sentences/);
});

test("voice brain maps gendered neural voices and detects caller language on later turns", async () => {
  const lib = await loadVoiceBrain();

  assert.equal(lib.resolveVoice("hi-IN", "female"), "hi-IN-SwaraNeural");
  assert.equal(lib.resolveVoice("hi-IN", "male"), "hi-IN-MadhurNeural");
  assert.equal(lib.resolveVoice("en-IN", "female"), "en-IN-NeerjaNeural");
  assert.equal(lib.resolveVoice("en-IN", "male"), "en-IN-PrabhatNeural");
  assert.equal(lib.resolveVoice("gu-IN", "female"), "gu-IN-DhwaniNeural");
  assert.equal(lib.resolveVoice("gu-IN", "male"), "gu-IN-NiranjanNeural");

  assert.equal(lib.detectVoiceLanguage("मुझे कीमत चाहिए", "en-IN", true), "hi-IN");
  assert.equal(lib.detectVoiceLanguage("કિંમત કેટલી છે?", "en-IN", true), "gu-IN");
  assert.equal(lib.detectVoiceLanguage("kem cho, tamane jovu chhe", "en-IN", true), "gu-IN");
  assert.equal(lib.detectVoiceLanguage("aapka price kya hai?", "en-IN", true), "hi-IN");
  assert.equal(lib.detectVoiceLanguage("What is the price?", "hi-IN", true), "hi-IN");
  assert.equal(lib.detectVoiceLanguage("नमस्ते", "hi-IN", false), "hi-IN");
});

test("voice brain keeps Groq turn responses under two seconds with the fast model", async () => {
  const lib = await loadVoiceBrain();
  let capturedBody;
  const previousModel = process.env.GROQ_VOICE_MODEL;
  delete process.env.GROQ_VOICE_MODEL;
  try {
    const result = await lib.generateVoiceResponse(
      { message: "hello", language: "en-IN", knowledgeBase: null },
      {
        groqKey: "test-key",
        fetchImpl: async (_url, init) => {
          capturedBody = JSON.parse(init.body);
          return {
            ok: true,
            json: async () => ({ choices: [{ message: { content: "Namaste, how can I help?" } }] }),
          };
        },
      }
    );
    assert.equal(result.provider, "groq");
    assert.equal(capturedBody.model, "qwen/qwen3.8-27b");
    assert.ok(capturedBody.max_tokens <= 160);
  } finally {
    if (previousModel === undefined) {
      delete process.env.GROQ_VOICE_MODEL;
    } else {
      process.env.GROQ_VOICE_MODEL = previousModel;
    }
  }
});

test("edge-tts wiring uses local CLI with python module fallback and no paid speech API", () => {
  const lib = read("src/lib/edgeTts.ts");
  assert.match(lib, /edge-tts/);
  assert.match(lib, /"-m", "edge_tts"/);
  assert.match(lib, /--write-media/);
  assert.match(lib, /--rate/);
  assert.match(lib, /resolveVoice\(language, deps\.gender \?\? "female"\)/);
  assert.match(lib, /mimeType: "audio\/mpeg"/);
  assert.match(lib, /provider: "unavailable"/);
  assert.doesNotMatch(lib, /api\.openai\.com|elevenlabs|api\.groq\.com/);
  assert.doesNotMatch(lib, /trycloudflare\.com|hmnt_tts_2026/);
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
