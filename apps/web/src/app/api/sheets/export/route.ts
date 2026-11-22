import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { buildCsv, leadSheetValues, parseGoogleSheetUrl, SHEET_EXPORT_COLUMNS } from "../../../../lib/sheetSyncCore.mjs";
import { hasGoogleSheetsCredentials, writeSheetRows } from "../../../../lib/sheetSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type LeadRow = Record<string, unknown>;

function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export async function GET(request: Request): Promise<Response> {
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

  const params = new URL(request.url).searchParams;
  const format = (params.get("format") ?? "csv").toLowerCase();
  if (format !== "csv" && format !== "sheet") {
    return NextResponse.json({ error: "format must be csv or sheet" }, { status: 400 });
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(5000);

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const leadRows = (leads ?? []) as LeadRow[];
  const values = leadRows.map((lead) => leadSheetValues(lead));

  if (format === "csv") {
    const csv = buildCsv(SHEET_EXPORT_COLUMNS, values);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="leads_sheet_sync.csv"',
        "Cache-Control": "no-store",
      },
    });
  }

  const sheetUrl = params.get("sheet_url") || process.env.GOOGLE_SHEET_URL || "";
  const ref = parseGoogleSheetUrl(sheetUrl);
  if (!ref) {
    return NextResponse.json(
      { error: "Provide a valid Google Sheets URL to export into." },
      { status: 400 }
    );
  }
  if (!hasGoogleSheetsCredentials()) {
    return NextResponse.json(
      {
        error: "Google Sheets credentials are not configured. Use CSV export instead.",
        mode: "unavailable",
      },
      { status: 503 }
    );
  }

  const result = await writeSheetRows(ref, [SHEET_EXPORT_COLUMNS, ...values]);
  if (!result.ok) {
    return NextResponse.json({ error: result.error, mode: "google_sheets" }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    mode: "google_sheets",
    sheet_id: ref.sheetId,
    rows_written: leadRows.length,
    updated_rows: result.updatedRows,
  });
}
