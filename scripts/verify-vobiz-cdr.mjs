import { readFileSync } from "node:fs";

const envPath = new URL("../apps/web/.env.local", import.meta.url);
let fileEnv = {};
try {
  fileEnv = Object.fromEntries(
    readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
} catch {
  fileEnv = {};
}

const authId = process.env.VOBIZ_AUTH_ID || fileEnv.VOBIZ_AUTH_ID || "";
const authToken = process.env.VOBIZ_AUTH_TOKEN || fileEnv.VOBIZ_AUTH_TOKEN || "";
if (!authId || !authToken) {
  console.error("VOBIZ_AUTH_ID / VOBIZ_AUTH_TOKEN missing from apps/web/.env.local");
  process.exit(2);
}

const headers = { "X-Auth-ID": authId, "X-Auth-Token": authToken };
const base = `https://api.vobiz.ai/api/v1/Account/${encodeURIComponent(authId)}/Call/`;
const response = await fetch(`${base}?limit=50`, {
  headers,
  signal: AbortSignal.timeout(20000),
});
if (!response.ok) {
  console.error(`Vobiz CDR list failed with HTTP ${response.status}`);
  process.exit(2);
}

const payload = await response.json();
const calls = Array.isArray(payload.objects) ? payload.objects : [];
const isInvalidAnswerXml = (call) =>
  call?.hangup_cause_code === 8011 ||
  [call?.hangup_cause, call?.hangup_cause_name, call?.failure_reason, call?.failure_code].some(
    (value) => /invalid answer xml/i.test(String(value ?? ""))
  );

const lastInvalidIndex = calls.findIndex(isInvalidAnswerXml);
const liveCalls = lastInvalidIndex === -1 ? calls : calls.slice(0, lastInvalidIndex);
const invalid = liveCalls.filter(isInvalidAnswerXml);
const totalInvalid = calls.filter(isInvalidAnswerXml).length;

console.log(`CDRs returned: ${calls.length}`);
console.log(`Historical Invalid Answer XML hangups: ${totalInvalid}`);
console.log(`Live CDRs checked: ${liveCalls.length}`);
console.log(`Live Invalid Answer XML hangups: ${invalid.length}`);
if (!calls.length) {
  console.error("No live Vobiz CDRs available to verify");
  process.exit(2);
}

const latest = calls[0];
const detailResponse = await fetch(`${base}${encodeURIComponent(latest.call_uuid)}/`, {
  headers,
  signal: AbortSignal.timeout(20000),
});
if (!detailResponse.ok) {
  console.error(`Vobiz CDR detail failed with HTTP ${detailResponse.status}`);
  process.exit(2);
}
const detail = await detailResponse.json();
console.log(
  `Latest CDR: ${detail.call_uuid} ${detail.end_time ?? ""} code=${detail.hangup_cause_code ?? "none"} cause=${detail.hangup_cause ?? "none"}`
);
if (isInvalidAnswerXml(detail)) {
  console.error("Latest live CDR has an Invalid Answer XML hangup");
  process.exit(1);
}
if (invalid.length) {
  console.log(JSON.stringify(invalid, null, 2));
  process.exit(1);
}
