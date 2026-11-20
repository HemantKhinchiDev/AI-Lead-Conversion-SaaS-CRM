import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const CSV_COLUMNS = [
  "id",
  "full_name",
  "phone",
  "email",
  "property_interest",
  "consent_given",
  "status",
  "created_at",
] as const;

type CsvColumn = (typeof CSV_COLUMNS)[number];
type LeadExportRow = Record<CsvColumn, unknown>;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: LeadExportRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const body = rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(","));
  return [header, ...body].join("\n") + "\n";
}

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

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select(CSV_COLUMNS.join(","))
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (leadsError) {
    return NextResponse.json({ error: leadsError.message }, { status: 500 });
  }

  const csv = buildCsv((leads ?? []) as unknown as LeadExportRow[]);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="leads.csv"',
      "Cache-Control": "no-store",
    },
  });
}
