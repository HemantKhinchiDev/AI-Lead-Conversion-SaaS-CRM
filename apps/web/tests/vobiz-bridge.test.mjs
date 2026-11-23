import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function source(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

let vobizPromise;
function loadVobiz() {
  if (!vobizPromise) {
    vobizPromise = (async () => {
      const js = ts.transpileModule(source("src/lib/vobiz.ts"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const dir = mkdtempSync(join(tmpdir(), "vobiz-bridge-"));
      const file = join(dir, "vobiz.mjs");
      writeFileSync(file, js, "utf8");
      try {
        return await import(pathToFileURL(file).href);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  }
  return vobizPromise;
}

const VOBIZ_TEST_ENV = {
  VOBIZ_AUTH_ID: "MA_test_auth",
  VOBIZ_AUTH_TOKEN: "test-token",
  VOBIZ_FROM_NUMBER: "+918064264324",
  VOBIZ_ANSWER_URL: "https://example.test/api/voice/vobiz-xml",
};

const VOBIZ_API_ENV = {
  VOBIz_API_KEY: "vk_test",
  VOBIz_ACCOUNT_ID: "acct_test",
  VOBIz_FROM_NUMBER: "+918064264324",
};

const VOBIZ_TEST_ANSWER_URL = "https://example.test/api/voice/vobiz-xml";

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
  assert.match(route, /<Record action=/);
  assert.match(route, /maxLength="12" timeout="3" playBeep="true"/);
  assert.match(route, /method="POST"/);
  assert.match(route, /finishOnKey="#"/);
  assert.match(route, /playBeep="true"/);
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

test("vobiz config parsing rejects placeholders and normalizes destinations", async () => {
  const { getVobizConfig, getVobizApiConfig, normalizeVobizNumber } = await loadVobiz();

  assert.deepEqual(getVobizConfig(VOBIZ_TEST_ENV), {
    authId: "MA_test_auth",
    authToken: "test-token",
    fromNumber: "+918064264324",
    answerUrl: VOBIZ_TEST_ANSWER_URL,
  });
  assert.equal(getVobizConfig({ ...VOBIZ_TEST_ENV, VOBIZ_AUTH_TOKEN: "REPLACE_ME" }), null);
  assert.equal(getVobizConfig({ VOBIZ_AUTH_ID: "MA_test_auth" }), null);

  const apiConfig = getVobizApiConfig(VOBIZ_API_ENV);
  assert.equal(apiConfig.apiKey, "vk_test");
  assert.equal(apiConfig.accountId, "acct_test");
  assert.equal(apiConfig.fromNumber, "+918064264324");
  assert.equal(apiConfig.edgeVoice, "en-IN-NeerjaNeural");
  assert.equal(getVobizApiConfig({}), null);
  assert.equal(getVobizApiConfig({ ...VOBIZ_API_ENV, VOBIz_API_KEY: "REPLACE_ME" }), null);
  const legacyConfig = getVobizApiConfig({
    VOBIZ_AUTH_ID: "MA_test_auth",
    VOBIZ_AUTH_TOKEN: "legacy-token",
    VOBIZ_FROM_NUMBER: "+918064264324",
  });
  assert.equal(legacyConfig.apiKey, "legacy-token");

  const destinations = [
    ["98765 43210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["+1 (415) 555-0100", "+14155550100"],
    ["not-a-phone", ""],
    ["12345", ""],
    [null, ""],
  ];
  for (const [raw, expected] of destinations) {
    assert.equal(normalizeVobizNumber(raw), expected, `destination: ${raw}`);
  }
});

test("placeVobizCall posts authenticated payload and reads provider call ids", async () => {
  const { getVobizConfig, placeVobizCall } = await loadVobiz();
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return { ok: true, json: async () => ({ request_uuid: ["uuid-123"] }) };
  };

  const result = await placeVobizCall(
    { to: "09876543210" },
    { config: getVobizConfig(VOBIZ_TEST_ENV), fetchImpl, timeoutMs: 100 }
  );

  assert.deepEqual(result, { ok: true, providerCallId: "uuid-123" });
  assert.equal(captured.url, "https://api.vobiz.ai/api/v1/Account/MA_test_auth/Call/");
  assert.equal(captured.init.method, "POST");
  assert.deepEqual(captured.init.headers, {
    "X-Auth-ID": "MA_test_auth",
    "X-Auth-Token": "test-token",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(captured.init.body), {
    from: "+918064264324",
    to: "+919876543210",
    answer_url: VOBIZ_TEST_ANSWER_URL,
    answer_method: "POST",
  });
  assert.ok(captured.init.signal instanceof AbortSignal);
});

test("placeVobizCall fails safely on invalid input, provider errors and timeouts", async () => {
  const { getVobizConfig, placeVobizCall } = await loadVobiz();
  const config = getVobizConfig(VOBIZ_TEST_ENV);
  const input = { to: "9876543210", answerUrl: VOBIZ_TEST_ANSWER_URL };
  const unusedFetch = async () => {
    throw new Error("fetch should not be called");
  };

  assert.deepEqual(await placeVobizCall(input, { config: null, fetchImpl: unusedFetch }), {
    ok: false,
    error: "Vobiz is not configured",
  });
  assert.deepEqual(await placeVobizCall({ ...input, to: "bad" }, { config, fetchImpl: unusedFetch }), {
    ok: false,
    error: "Destination phone number is not valid for Vobiz",
  });
  assert.deepEqual(
    await placeVobizCall(
      { to: "9876543210" },
      { config: { ...config, answerUrl: "" }, fetchImpl: unusedFetch }
    ),
    { ok: false, error: "Vobiz answer URL is not configured" }
  );
  assert.deepEqual(
    await placeVobizCall(input, {
      config,
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ message: "rate limited" }) }),
    }),
    { ok: false, error: "rate limited" }
  );
  assert.deepEqual(
    await placeVobizCall(input, {
      config,
      fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    }),
    { ok: false, error: "Vobiz call failed (HTTP 500)" }
  );
  assert.deepEqual(
    await placeVobizCall(input, {
      config,
      fetchImpl: async () => {
        throw new Error("network down");
      },
    }),
    { ok: false, error: "network down" }
  );
  assert.deepEqual(
    await placeVobizCall(input, {
      config,
      timeoutMs: 5,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
    }),
    { ok: false, error: "aborted" }
  );
});

test("startVobizCall dispatches live calls and preserves the sandbox fallback", async () => {
  const { startVobizCall } = await loadVobiz();
  const input = { to: "9876543210", answerUrl: VOBIZ_TEST_ANSWER_URL };
  let captured;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return { ok: true, json: async () => ({ api_id: "call-abc" }) };
  };

  const live = await startVobizCall(input, { env: VOBIZ_API_ENV, fetchImpl, timeoutMs: 100 });
  assert.deepEqual(live, { ok: true, provider: "vobiz", mode: "live", providerCallId: "call-abc" });
  assert.equal(captured.url, "https://api.vobiz.ai/api/v1/calls");
  assert.deepEqual(captured.init.headers, {
    Authorization: "Bearer vk_test",
    "X-Account-ID": "acct_test",
    "Content-Type": "application/json",
  });
  assert.deepEqual(JSON.parse(captured.init.body), {
    account_id: "acct_test",
    from: "+918064264324",
    to: "+919876543210",
    answer_url: VOBIZ_TEST_ANSWER_URL,
    answer_method: "POST",
  });

  const simulated = await startVobizCall(input, { env: {}, fetchImpl });
  assert.equal(simulated.ok, true);
  assert.equal(simulated.provider, "sandbox_voice_sim");
  assert.equal(simulated.mode, "simulated");
  assert.match(simulated.warning, /simulated provider/);

  const failures = [
    [{ ...input, to: "bad" }, "Destination phone number is not valid for Vobiz"],
    [{ ...input, answerUrl: "not-a-url" }, "Vobiz answer URL is not configured"],
  ];
  for (const [badInput, expected] of failures) {
    const result = await startVobizCall(badInput, { env: VOBIZ_API_ENV, fetchImpl });
    assert.deepEqual(result, { ok: false, provider: "vobiz", mode: "live", error: expected });
  }

  const providerFailure = await startVobizCall(input, {
    env: VOBIZ_API_ENV,
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
  });
  assert.deepEqual(providerFailure, {
    ok: false,
    provider: "vobiz",
    mode: "live",
    error: "Vobiz call failed (HTTP 503)",
  });
});

test("buildVobizXml escapes input, plays cached TTS audio and bounds the conversation", async () => {
  const { buildVobizXml, buildGroqEdgeTtsVobizXml, escapeVobizXml } = await loadVobiz();

  assert.equal(escapeVobizXml('<&"\'>'), "&lt;&amp;&quot;&apos;&gt;");

  const prompt = buildVobizXml({
    text: "Lead context <private>",
    voice: "hi-IN-SwaraNeural",
    prompt: "Press 1 or say yes",
    actionUrl: "https://example.test/api/voice/vobiz-xml?call=1&turn=2",
    audioUrl: "https://example.test/audio/greeting.mp3",
  });
  assert.match(prompt, /^<\?xml version="1.0" encoding="UTF-8"\?><Response>/);
  assert.ok(prompt.includes('<Play>https://example.test/audio/greeting.mp3</Play>'));
  assert.ok(prompt.includes('action="https://example.test/api/voice/vobiz-xml?call=1&amp;turn=2"'));
  assert.ok(prompt.includes('method="POST" maxLength="12" timeout="3" playBeep="true"'));
  assert.ok(prompt.includes('<Speak voice="hi-IN-SwaraNeural">Press 1 or say yes</Speak>'));
  assert.ok(!prompt.includes("<private>"));

  const ending = buildVobizXml({
    text: 'Goodbye <lead> & "friends"',
    voice: "en-IN-NeerjaNeural",
    end: true,
  });
  assert.ok(
    ending.includes(
      '<Speak voice="en-IN-NeerjaNeural">Goodbye &lt;lead&gt; &amp; &quot;friends&quot;</Speak><Hangup/>'
    )
  );
  assert.ok(!ending.includes("<GetDigits"));

  const tts = buildGroqEdgeTtsVobizXml({
    text: "Invented price",
    voice: "en-IN-NeerjaNeural",
    groqKey: "test-key",
    ttsAudioUrl: "https://example.test/audio/answer.mp3",
    actionUrl: VOBIZ_TEST_ANSWER_URL,
  });
  assert.ok(tts.includes("<Play>https://example.test/audio/answer.mp3</Play>"));
  assert.ok(!tts.includes("Invented price"));

  const previousGroqKey = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const fallback = buildGroqEdgeTtsVobizXml({
      text: "Invented price",
      voice: "en-IN-NeerjaNeural",
    });
    assert.ok(fallback.includes("Thank you for your time"));
    assert.ok(!fallback.includes("Invented price"));
  } finally {
    if (previousGroqKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = previousGroqKey;
    }
  }
});

test("handleVobizWebhook normalizes JSON, form and array webhook events", async () => {
  const { handleVobizWebhook } = await loadVobiz();

  const completed = handleVobizWebhook(
    JSON.stringify({
      request_uuid: "uuid-1",
      CallStatus: "completed",
      Digits: "2",
      SpeechText: "yes please",
    })
  );
  assert.equal(completed.providerCallId, "uuid-1");
  assert.equal(completed.callStatus, "completed");
  assert.equal(completed.dtmf, "2");
  assert.equal(completed.speech, "yes please");
  assert.equal(completed.hangup, true);

  const form = handleVobizWebhook("call_uuid=uuid-2&event=hangup&dtmf=9");
  assert.equal(form.providerCallId, "uuid-2");
  assert.equal(form.callStatus, "hangup");
  assert.equal(form.dtmf, "9");
  assert.equal(form.hangup, true);

  const inProgress = handleVobizWebhook({ api_id: ["uuid-3"], status: "in-progress", digits: "5" });
  assert.equal(inProgress.providerCallId, "uuid-3");
  assert.equal(inProgress.callStatus, "in-progress");
  assert.equal(inProgress.dtmf, "5");
  assert.equal(inProgress.hangup, false);

  const empty = handleVobizWebhook(undefined);
  assert.equal(empty.providerCallId, "");
  assert.equal(empty.callStatus, "");
  assert.equal(empty.hangup, false);
});
