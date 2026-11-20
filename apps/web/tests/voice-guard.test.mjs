import test from "node:test";
import assert from "node:assert/strict";

const ALLOWED = new Set(["new", "contacted", "qualified", "site_visit", "negotiation", "closed_won", "closed_lost"]);

function evaluateVoiceEligibility(lead, sessionTenantId) {
  if (!sessionTenantId) return { allowed: false, status: 403 };
  if (!lead || !lead.id || lead.tenant_id !== sessionTenantId) return { allowed: false, status: 404 };
  if (lead.status === "excluded" || lead.status === "review_required") return { allowed: false, status: 403 };
  if (lead.consent_given !== true) return { allowed: false, status: 403 };
  return { allowed: true, status: 200 };
}

function sanitizeWebhookLeadStatus(raw) {
  if (typeof raw !== "string") return null;
  const n = raw.trim().toLowerCase();
  return ALLOWED.has(n) ? n : null;
}

test("voice eligibility enforces tenant match, consent_given, and non-excluded status", () => {
  assert.equal(evaluateVoiceEligibility({ id: "l1", tenant_id: "t1", consent_given: true, status: "new" }, "t1").allowed, true);
  assert.equal(evaluateVoiceEligibility({ id: "l1", tenant_id: "t2", consent_given: true, status: "new" }, "t1").status, 404);
  assert.equal(evaluateVoiceEligibility({ id: "l1", tenant_id: "t1", consent_given: false, status: "new" }, "t1").status, 403);
  assert.equal(evaluateVoiceEligibility({ id: "l1", tenant_id: "t1", consent_given: true, status: "excluded" }, "t1").status, 403);
});

test("sanitizeWebhookLeadStatus accepts only valid pipeline stages", () => {
  assert.equal(sanitizeWebhookLeadStatus("Site_Visit"), "site_visit");
  assert.equal(sanitizeWebhookLeadStatus("hacked_stage"), null);
});
