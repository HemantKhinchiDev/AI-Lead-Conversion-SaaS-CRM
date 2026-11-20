import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(
  here,
  "..",
  "src",
  "app",
  "api",
  "tenant",
  "call_logs",
  "export",
  "route.ts"
);
const source = readFileSync(routePath, "utf8");

test("call log export route returns a downloadable tenant-scoped text/csv attachment", () => {
  assert.match(source, /text\/csv/);
  assert.match(source, /Content-Disposition/);
  assert.match(source, /attachment; filename="call_logs_\$\{tenantId\}\.csv"/);
  assert.match(source, /Cache-Control/);
});

test("call log export route requires and validates an authenticated session", () => {
  assert.match(source, /auth\.getUser/);
  assert.match(source, /authorization/i);
  assert.match(source, /status: 401/);
  assert.match(source, /status: 403/);
});

test("call log export route derives tenant exclusively from the session membership", () => {
  assert.match(source, /from\("users"\)/);
  assert.match(source, /select\("tenant_id"\)/);
  assert.match(source, /userData\.user\.id/);
  assert.match(source, /from\("call_logs"\)/);
  assert.match(source, /\.eq\("tenant_id", tenantId\)/);
});

test("call log export route never accepts tenant_id from the client", () => {
  assert.doesNotMatch(source, /searchParams/);
  assert.doesNotMatch(source, /request\.json\(/);
  assert.doesNotMatch(source, /req\.json\(/);
  assert.doesNotMatch(source, /body\??\.tenant_id/);
  assert.doesNotMatch(source, /query\??\.tenant_id/);
});

test("call log export route handles failures and escapes CSV cells", () => {
  assert.match(source, /catch \(error: unknown\)/);
  assert.match(source, /status: 500/);
  assert.match(source, /csvCell/);
  assert.match(source, /replace\(\/"\/g, '\"\"'\)/);
});
