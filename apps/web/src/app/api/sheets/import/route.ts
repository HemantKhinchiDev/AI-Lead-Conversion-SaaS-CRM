import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizePhoneE164, parseCsvText, prepareBatchImport, type RawImportRow } from "../../../../lib/leadImport";
import { fetchSheetTable, sheetLeadRowsFromTable } from "../../../../lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImportBody = {
  sheet_url?: unknown;
  csv?: unknown;
  rows?: unknown;
};

type ExistingLead = {
  id: string;
  phone: string | null;
  sheet_id: string | null;
  sheet_row_index: number | null;
};

function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function POST(request: Request): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Supabase is not configured" }, { status: 500 });
  }

  const token = readBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized session" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ error: "Invalid user session" }, { status: 401 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from("users")
    .select("tenant_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  const tenantId = typeof membership?.tenant_id === "string" ? membership.tenant_id : "";
  if (membershipError || !tenantId) {
    return NextResponse.json({ error: "Tenant membership not found" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as ImportBody;
  let rawRows: RawImportRow[];
  let sheetId = "";
  let sheetSource: "google_api" | "public_csv" | "upload" = "upload";
  const rowIndexByPhone = new Map<string, number>();

  if (body.sheet_url !== undefined && body.sheet_url !== null && String(body.sheet_url).trim()) {
    const table = await fetchSheetTable(body.sheet_url);
    if (!table.ok) {
      return NextResponse.json({ error: table.error }, { status: 400 });
    }
    const sheetRows = sheetLeadRowsFromTable(table.rows);
    if (sheetRows.length === 0) {
      return NextResponse.json(
        { error: "No lead rows found. Include name and phone columns with a header row." },
        { status: 400 }
      );
    }
    for (const row of sheetRows) {
      const phone = normalizePhoneE164(row.phone);
      if (phone) rowIndexByPhone.set(phone, row.sheet_row_index);
    }
    rawRows = sheetRows;
    sheetId = table.ref.sheetId;
    sheetSource = table.source;
  } else if (Array.isArray(body.rows)) {
    rawRows = body.rows as RawImportRow[];
  } else {
    rawRows = parseCsvText(String(body.csv ?? ""));
  }

  const batch = prepareBatchImport(rawRows, tenantId);

  const { data: existingData, error: existingError } = await supabase
    .from("leads")
    .select("id, phone, sheet_id, sheet_row_index")
    .eq("tenant_id", tenantId)
    .limit(5000);

  if (existingError) {
    return NextResponse.json({ error: existingError.message }, { status: 500 });
  }

  const existing = (existingData ?? []) as ExistingLead[];
  const byPhone = new Map<string, ExistingLead>();
  const bySheetRow = new Map<number, ExistingLead>();
  for (const lead of existing) {
    if (lead.phone) byPhone.set(lead.phone, lead);
    if (sheetId && lead.sheet_id === sheetId && typeof lead.sheet_row_index === "number") {
      bySheetRow.set(lead.sheet_row_index, lead);
    }
  }

  const toInsert: Array<Record<string, unknown>> = [];
  let updated = 0;
  let existingDuplicates = 0;

  for (const lead of batch.validLeads) {
    const rowIndex = rowIndexByPhone.get(lead.phone_e164) ?? null;
    const existingByRow = rowIndex !== null ? bySheetRow.get(rowIndex) : undefined;
    const existingByPhone = byPhone.get(lead.phone_e164);

    if (existingByRow) {
      const { error: updateError } = await supabase
        .from("leads")
        .update({
          full_name: lead.full_name,
          phone: lead.phone_e164,
          consent_given: lead.consent_given,
          status: lead.status,
        })
        .eq("id", existingByRow.id)
        .eq("tenant_id", tenantId);
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      updated += 1;
      continue;
    }

    if (existingByPhone) {
      existingDuplicates += 1;
      continue;
    }

    toInsert.push({
      tenant_id: tenantId,
      full_name: lead.full_name,
      phone: lead.phone_e164,
      consent_given: lead.consent_given,
      status: lead.status,
      source: sheetId ? "google_sheet_import" : lead.source,
      sheet_id: sheetId || null,
      sheet_row_index: rowIndex,
    });
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase.from("leads").insert(toInsert);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      source: sheetSource,
      sheet_id: sheetId || null,
      inserted: toInsert.length,
      updated,
      summary: {
        ...batch.counts,
        duplicates: batch.counts.duplicates + existingDuplicates,
      },
    },
    { status: 200 }
  );
}
