import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, "..", "src", "app", "api", "leads", "export", "route.ts");
const source = readFileSync(routePath, "utf8");

test("leads export route returns a downloadable text/csv attachment", () => {
  assert.match(source, /text\/csv/);
  assert.match(source, /Content-Disposition/);
  assert.match(source, /attachment; filename="leads\.csv"/);
  assert.match(source, /Cache-Control/);
});

test("leads export route requires and validates a server session", () => {
  assert.match(source, /auth\.getUser/);
  assert.match(source, /authorization/i);
  assert.match(source, /status: 401/);
});

test("leads export route derives tenant from session and scopes the query", () => {
  assert.match(source, /from\("users"\)/);
  assert.match(source, /select\("tenant_id"\)/);
  assert.match(source, /\.eq\("tenant_id", tenantId\)/);
  assert.doesNotMatch(source, /searchParams/);
  assert.doesNotMatch(source, /request\.json\(/);
});
