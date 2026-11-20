export interface RawImportRow {
  full_name?: string;
  phone?: string;
  source?: string;
  consent_given?: boolean | string;
  suppressed?: boolean | string;
}

export interface NormalizedImportLead {
  tenant_id: string;
  full_name: string;
  phone_e164: string;
  source: string;
  consent_given: boolean;
  status: "new" | "review_required" | "excluded";
  reason?: string;
}

export function normalizePhoneE164(rawPhone: string): string | null {
  const digits = String(rawPhone || "").replace(/[^\d+]/g, "");
  if (digits.startsWith("+") && digits.length >= 11) return digits;
  const only = digits.replace(/\D/g, "");
  if (only.length === 10) return "+91" + only;
  if (only.length === 12 && only.startsWith("91")) return "+" + only;
  return null;
}

export function evaluateImportRow(
  row: RawImportRow,
  tenantId: string
): { ok: boolean; lead?: NormalizedImportLead; error?: string } {
  if (!tenantId) return { ok: false, error: "missing_tenant" };
  const name = String(row.full_name || "").trim();
  if (name.length < 2) return { ok: false, error: "invalid_name" };
  const phoneE164 = normalizePhoneE164(String(row.phone || ""));
  if (!phoneE164) return { ok: false, error: "invalid_phone" };
  const suppressed =
    row.suppressed === true ||
    String(row.suppressed || "").toLowerCase() === "true";
  const consent =
    row.consent_given === true ||
    String(row.consent_given || "").toLowerCase() === "true";
  if (suppressed) {
    return {
      ok: true,
      lead: {
        tenant_id: tenantId,
        full_name: name,
        phone_e164: phoneE164,
        source: String(row.source || "csv_import"),
        consent_given: false,
        status: "excluded",
        reason: "suppressed",
      },
    };
  }
  return {
    ok: true,
    lead: {
      tenant_id: tenantId,
      full_name: name,
      phone_e164: phoneE164,
      source: String(row.source || "csv_import"),
      consent_given: consent,
      status: consent ? "new" : "review_required",
      ...(consent ? {} : { reason: "consent_missing" }),
    },
  };
}

export interface BatchImportSummary {
  validLeads: NormalizedImportLead[];
  counts: {
    total: number;
    eligible: number;
    review_required: number;
    excluded: number;
    duplicates: number;
    invalid: number;
  };
}

export function parseCsvText(csvText: string): RawImportRow[] {
  const lines = String(csvText || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = cols[idx] ?? "";
    });
    return {
      full_name: row.full_name || row.name || "",
      phone: row.phone || row.mobile || "",
      source: row.source || "csv_import",
      consent_given: row.consent_given ?? row.consent ?? "false",
      suppressed: row.suppressed ?? row.dnc ?? "false",
    };
  });
}

export function prepareBatchImport(
  rows: RawImportRow[],
  tenantId: string
): BatchImportSummary {
  const seenPhones = new Set<string>();
  const validLeads: NormalizedImportLead[] = [];
  const counts = {
    total: rows.length,
    eligible: 0,
    review_required: 0,
    excluded: 0,
    duplicates: 0,
    invalid: 0,
  };

  for (const row of rows) {
    const res = evaluateImportRow(row, tenantId);
    if (!res.ok || !res.lead) {
      counts.invalid += 1;
      continue;
    }
    if (seenPhones.has(res.lead.phone_e164)) {
      counts.duplicates += 1;
      continue;
    }
    seenPhones.add(res.lead.phone_e164);
    validLeads.push(res.lead);
    if (res.lead.status === "new") counts.eligible += 1;
    else if (res.lead.status === "review_required") counts.review_required += 1;
    else if (res.lead.status === "excluded") counts.excluded += 1;
  }

  return { validLeads, counts };
}
