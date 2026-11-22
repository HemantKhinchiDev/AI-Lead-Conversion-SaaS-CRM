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

test("knowledge base trainer route enforces auth, tenant isolation, and upserts knowledge_bases", () => {
  const route = read("src/app/api/kb/train/route.ts");
  assert.match(route, /readBearerToken/);
  assert.match(route, /auth\.getUser/);
  assert.match(route, /from\("users"\)/);
  assert.match(route, /tenant_id/);
  assert.match(route, /from\("knowledge_bases"\)/);
  assert.match(route, /upsert/);
  assert.match(route, /onConflict: "tenant_id"/);
  assert.doesNotMatch(route, /body\?\.tenant_id|body\.tenant_id/);
});

test("knowledge base lib uses Jina with fetch fallback and Groq JSON mode", () => {
  const lib = read("src/lib/knowledgeBase.ts");
  assert.match(lib, /https:\/\/r\.jina\.ai\//);
  assert.match(lib, /llama-3\.3-70b-versatile/);
  assert.match(lib, /response_format: \{ type: "json_object" \}/);
  assert.match(lib, /GROQ_API_KEY/);
  assert.match(lib, /buildFallbackKnowledge/);
  assert.match(lib, /isPublicHttpUrl/);
});

test("dashboard exposes the Train AI Agent panel with universal fields", () => {
  const component = read("src/components/TrainAgentCard.tsx");
  for (const label of ["Business name", "Website URL", "Google Map link", "Call goal", "Script editor", "Train AI Agent"]) {
    assert.ok(component.includes(label), `missing label: ${label}`);
  }
  assert.match(component, /\/api\/kb\/train/);

  const page = read("src/app/dashboard/page.tsx");
  assert.match(page, /import TrainAgentCard from/);
  assert.match(page, /<TrainAgentCard \/>/);
});

test("trainer files do not contain hardcoded provider secrets", () => {
  const combined = read("src/lib/knowledgeBase.ts") + read("src/app/api/kb/train/route.ts") + read("src/components/TrainAgentCard.tsx");
  assert.doesNotMatch(combined, /gsk_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
});
