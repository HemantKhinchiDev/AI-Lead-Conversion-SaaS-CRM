const ALLOWED_LEAD_STATUSES = new Set([
  "new",
  "contacted",
  "qualified",
  "site_visit",
  "negotiation",
  "closed_won",
  "closed_lost",
]);

export function evaluateVoiceEligibility(
  lead: { id?: string; tenant_id?: string; consent_given?: boolean; status?: string } | null,
  sessionTenantId: string
): { allowed: boolean; status: number; error?: string } {
  if (!sessionTenantId) {
    return { allowed: false, status: 403, error: "Tenant membership not found" };
  }
  if (!lead || !lead.id || lead.tenant_id !== sessionTenantId) {
    return { allowed: false, status: 404, error: "Lead not found" };
  }
  if (lead.status === "excluded" || lead.status === "review_required") {
    return { allowed: false, status: 403, error: "Blocked: Lead status not eligible for outbound call" };
  }
  if (lead.consent_given !== true) {
    return { allowed: false, status: 403, error: "Blocked: Explicit consent not verified" };
  }
  return { allowed: true, status: 200 };
}

export function sanitizeWebhookLeadStatus(rawStatus: unknown): string | null {
  if (typeof rawStatus !== "string") return null;
  const normalized = rawStatus.trim().toLowerCase();
  return ALLOWED_LEAD_STATUSES.has(normalized) ? normalized : null;
}
