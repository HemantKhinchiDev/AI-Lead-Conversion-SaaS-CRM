import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function read(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

let libraryPromise;
function loadCallAnalysis() {
  if (!libraryPromise) {
    libraryPromise = (async () => {
      const js = ts.transpileModule(read("src/lib/callAnalysis.ts"), {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      const dir = mkdtempSync(join(tmpdir(), "call-analysis-"));
      const file = join(dir, "callAnalysis.mjs");
      writeFileSync(file, js, "utf8");
      try {
        return await import(pathToFileURL(file).href);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  }
  return libraryPromise;
}

test("call analysis lib uses Groq JSON mode with a deterministic fallback", () => {
  const lib = read("src/lib/callAnalysis.ts");
  assert.match(lib, /llama-3\.3-70b-versatile/);
  assert.match(lib, /response_format: \{ type: "json_object" \}/);
  assert.match(lib, /GROQ_API_KEY/);
  for (const outcome of ["INTERESTED", "NOT_INTERESTED", "CALLBACK_REQUESTED", "NO_ANSWER"]) {
    assert.ok(lib.includes(`"${outcome}"`), `missing outcome: ${outcome}`);
  }
  assert.match(lib, /buildFallbackAnalysis/);
  assert.match(lib, /Never invent prices, availability, appointments/);
});

test("Groq JSON mode extracts outcome, callback time, summary, and full transcript", async () => {
  const { analyzeCall } = await loadCallAnalysis();
  let requestBody;
  const transcript = "Please call me back tomorrow at 9:30 am.";
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
    requestBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                call_outcome: "CALLBACK_REQUESTED",
                callback_datetime: "2026-11-23T09:30:00.000Z",
                ai_summary: "Lead asked to be contacted tomorrow morning.",
              }),
            },
          },
        ],
      }),
    };
  };

  const result = await analyzeCall(
    { transcript, call_status: "completed", language: "en-IN" },
    { fetchImpl, groqKey: "test-key" }
  );

  assert.equal(requestBody.model, "llama-3.3-70b-versatile");
  assert.deepEqual(requestBody.response_format, { type: "json_object" });
  assert.equal(result.call_outcome, "CALLBACK_REQUESTED");
  assert.equal(result.callback_datetime, "2026-11-23T09:30:00.000Z");
  assert.match(result.ai_summary, /contacted tomorrow/);
  assert.equal(result.full_transcript, transcript);
  assert.equal(result.provider, "groq");
});

test("deterministic fallback classifies interested, declined, callback, and no-answer calls", async () => {
  const { analyzeCall } = await loadCallAnalysis();
  const cases = [
    ["Yes, I am interested in the property.", "completed", "INTERESTED"],
    ["नहीं, मुझे कोई दिलचस्पी नहीं है।", "completed", "NOT_INTERESTED"],
    ["Please call me back tomorrow.", "completed", "CALLBACK_REQUESTED"],
    ["", "no_answer", "NO_ANSWER"],
  ];

  for (const [transcript, callStatus, expected] of cases) {
    const result = await analyzeCall({ transcript, call_status: callStatus }, { groqKey: "" });
    assert.equal(result.call_outcome, expected, `transcript: ${transcript}`);
    assert.equal(result.provider, "fallback");
    assert.ok(result.ai_summary.length > 0);
  }
});

test("simulated trigger transcript produces an INTERESTED outcome and AI summary", async () => {
  const { analyzeCall } = await loadCallAnalysis();
  const trigger = read("src/app/api/voice/trigger/route.ts");
  const match = trigger.match(/const transcript = `([^`]+)`/);
  assert.ok(match, "simulated transcript not found in trigger route");

  const result = await analyzeCall(
    { transcript: match[1], call_status: "completed", language: "en-IN" },
    { groqKey: "" }
  );
  assert.equal(result.call_outcome, "INTERESTED");
  assert.equal(result.full_transcript, match[1]);
  assert.match(result.ai_summary, /interest/i);
});

test("invalid and failed Groq responses fall back without throwing", async () => {
  const { analyzeCall } = await loadCallAnalysis();

  const invalid = await analyzeCall(
    { transcript: "Yes, I am interested.", call_status: "completed" },
    {
      groqKey: "test-key",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '{"call_outcome":"MAYBE","callback_datetime":"yesterday","ai_summary":""}',
              },
            },
          ],
        }),
      }),
    }
  );
  assert.equal(invalid.call_outcome, "INTERESTED");
  assert.ok(invalid.warnings.some((warning) => /Invalid Groq outcome/.test(warning)));

  const failed = await analyzeCall(
    { transcript: "Yes, I am interested.", call_status: "completed" },
    { groqKey: "test-key", fetchImpl: async () => { throw new Error("network down"); } }
  );
  assert.equal(failed.call_outcome, "INTERESTED");
  assert.ok(failed.warnings.some((warning) => /Groq extraction failed/.test(warning)));
});

test("analyze route authenticates, scopes by tenant, and updates call_logs and leads", () => {
  const route = read("src/app/api/voice/analyze/route.ts");
  assert.match(route, /auth\.getUser\(token\)/);
  assert.match(route, /from\("users"\)/);
  assert.match(route, /\.eq\("tenant_id", tenantId\)/);
  assert.match(route, /from\("call_logs"\)/);
  assert.match(route, /from\("leads"\)/);
  assert.match(route, /callOutcomeFields\(analysis\)/);
  assert.doesNotMatch(route, /body\?\.tenant_id|body\.tenant_id/);
});

test("webhook and simulated trigger persist outcome fields to call_logs and leads", () => {
  const webhook = read("src/app/api/voice/webhook/route.ts");
  assert.match(webhook, /analyzeCall/);
  assert.match(webhook, /callOutcomeFields/);
  assert.match(webhook, /sanitizeCallOutcome/);
  assert.match(webhook, /sanitizeIsoDatetime/);
  assert.match(webhook, /from\("call_logs"\)/);
  assert.match(webhook, /from\("leads"\)/);
  assert.doesNotMatch(webhook, /ai_summary:\s*fields\.ai_summary,\s*\n\s*next_action/);

  const trigger = read("src/app/api/voice/trigger/route.ts");
  assert.match(trigger, /provider: "sandbox_voice_sim"/);
  assert.match(trigger, /analyzeCall/);
  assert.match(trigger, /\.\.\.outcomeFields/);
  assert.match(trigger, /call_outcome: outcomeFields\.call_outcome/);
});

test("dashboard renders outcome badges, callback time, and AI summary in the leads table", () => {
  const page = read("src/app/dashboard/page.tsx");
  for (const label of [
    "Outcome",
    "Callback Time",
    "AI Summary",
    "OUTCOME_LABELS",
    "OUTCOME_STYLES",
    "formatCallbackTime",
    'data-testid="lead-outcome"',
    'data-testid="lead-callback"',
    'data-testid="lead-ai-summary"',
  ]) {
    assert.ok(page.includes(label), `missing: ${label}`);
  }
  assert.match(page, /lead\.call_outcome \?\? summary\?\.call_outcome/);
});

test("call analysis files do not contain hardcoded provider secrets", () => {
  const combined = [
    "src/lib/callAnalysis.ts",
    "src/app/api/voice/analyze/route.ts",
    "src/app/api/voice/webhook/route.ts",
    "src/app/api/voice/trigger/route.ts",
  ]
    .map((path) => read(path))
    .join("\n");
  assert.doesNotMatch(combined, /gsk_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
});
