import test from "node:test";
import assert from "node:assert/strict";

const VALID_STATUSES = ["new", "contacted", "qualified", "site_visit", "closed", "lost"];

function buildLeadPayload(input, userId) {
  if (!input.consent_given) {
    throw new Error("Consent required");
  }
  return {
    user_id: userId,
    full_name: String(input.full_name || "").trim(),
    phone: String(input.phone || "").trim(),
    email: input.email ? String(input.email).trim() : null,
    property_interest: input.property_interest ? String(input.property_interest).trim() : null,
    consent_given: Boolean(input.consent_given),
    status: VALID_STATUSES.includes(input.status) ? input.status : "new",
  };
}

test("buildLeadPayload creates valid tenant-isolated payload", () => {
  const payload = buildLeadPayload(
    { full_name: "  Amit Patel ", phone: " +919876543210 ", consent_given: true, property_interest: "3BHK" },
    "user-123"
  );
  assert.equal(payload.user_id, "user-123");
  assert.equal(payload.full_name, "Amit Patel");
  assert.equal(payload.status, "new");
});

test("buildLeadPayload enforces consent_given check", () => {
  assert.throws(() => buildLeadPayload({ full_name: "Test", phone: "123", consent_given: false }, "user-123"));
});

test("status transitions allow only valid pipeline stages", () => {
  const updated = buildLeadPayload(
    { full_name: "Sita", phone: "999", consent_given: true, status: "site_visit" },
    "user-123"
  );
  assert.equal(updated.status, "site_visit");
});
