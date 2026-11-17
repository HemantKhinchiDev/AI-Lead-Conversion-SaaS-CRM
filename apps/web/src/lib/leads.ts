const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

export const PERMISSION_STATES = ["verified", "review", "excluded"] as const;
export const LEAD_SOURCES = ["Website enquiry", "CSV import", "Manual entry"] as const;
export const LEAD_STATUSES = [
  "new",
  "contact_pending",
  "contacted",
  "interested",
  "hot_lead",
  "warm_lead",
  "cold_lead",
  "follow_up_required",
  "site_visit_requested",
  "site_visit_scheduled",
  "converted",
  "not_interested",
  "do_not_contact",
] as const;

export type PermissionState = (typeof PERMISSION_STATES)[number];
export type LeadSource = (typeof LEAD_SOURCES)[number];
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type Lead = {
  id: string;
  full_name: string;
  phone: string;
  source: LeadSource;
  permission: PermissionState;
  lead_status: LeadStatus;
  updated_label: string;
  mode: "dummy";
};

export type LeadListResponse = {
  items: Lead[];
  total: number;
  mode: "dummy";
};

export type LeadCreatePayload = {
  full_name: string;
  phone: string;
  source: LeadSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAllowed<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function isLead(value: unknown): value is Lead {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === "string" &&
    typeof value.full_name === "string" &&
    typeof value.phone === "string" &&
    isAllowed(value.source, LEAD_SOURCES) &&
    isAllowed(value.permission, PERMISSION_STATES) &&
    isAllowed(value.lead_status, LEAD_STATUSES) &&
    typeof value.updated_label === "string" &&
    value.mode === "dummy"
  );
}

export function isLeadListResponse(value: unknown): value is LeadListResponse {
  if (!isRecord(value)) {
    return false;
  }
  return (
    Array.isArray(value.items) &&
    value.items.every(isLead) &&
    typeof value.total === "number" &&
    value.mode === "dummy"
  );
}

export function leadsEndpoint(): string | null {
  if (!API_BASE_URL) {
    return null;
  }
  return `${API_BASE_URL.replace(/\/+$/, "")}/leads`;
}

export async function fetchLeads(signal?: AbortSignal): Promise<Lead[]> {
  const endpoint = leadsEndpoint();
  if (!endpoint) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }

  const response = await fetch(endpoint, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`Could not load leads (HTTP ${response.status})`);
  }

  const body: unknown = await response.json();
  if (!isLeadListResponse(body)) {
    throw new Error("Unexpected leads response from API");
  }
  return body.items;
}

export async function createLead(payload: LeadCreatePayload): Promise<Lead> {
  const endpoint = leadsEndpoint();
  if (!endpoint) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured");
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Could not reach the leads API");
  }

  if (response.status === 409) {
    throw new Error("A lead with this phone number already exists");
  }
  if (!response.ok) {
    throw new Error(`Could not add lead (HTTP ${response.status})`);
  }

  const body: unknown = await response.json();
  if (!isLead(body)) {
    throw new Error("Unexpected lead response from API");
  }
  return body;
}
