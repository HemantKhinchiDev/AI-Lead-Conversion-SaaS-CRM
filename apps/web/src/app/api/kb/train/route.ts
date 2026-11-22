import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  isPublicHttpUrl,
  normalizeLanguage,
  trainKnowledgeBase,
  type KnowledgeLanguage,
} from "../../../../lib/knowledgeBase";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type TrainBody = {
  business_name?: unknown;
  website_url?: unknown;
  google_maps_url?: unknown;
  call_goal?: unknown;
  custom_script?: unknown;
  language?: unknown;
};

function readBearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function readText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
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

  const body = (await request.json().catch(() => ({}))) as TrainBody;
  const businessName = readText(body.business_name, 200);
  const websiteUrl = readText(body.website_url, 2048);
  const googleMapsUrl = readText(body.google_maps_url, 2048);
  const callGoal = readText(body.call_goal, 500);
  const customScript = readText(body.custom_script, 4000);
  const language: KnowledgeLanguage = normalizeLanguage(body.language);

  if (!businessName && !websiteUrl && !googleMapsUrl && !callGoal && !customScript) {
    return NextResponse.json(
      { error: "Provide a business name, website URL, Google Maps link, call goal, or script." },
      { status: 400 }
    );
  }

  if (websiteUrl && !isPublicHttpUrl(websiteUrl)) {
    return NextResponse.json(
      { error: "website_url must be a public http(s) URL" },
      { status: 400 }
    );
  }

  if (googleMapsUrl && !isPublicHttpUrl(googleMapsUrl)) {
    return NextResponse.json(
      { error: "google_maps_url must be a public http(s) URL" },
      { status: 400 }
    );
  }

  const training = await trainKnowledgeBase({
    businessName,
    websiteUrl,
    googleMapsUrl,
    callGoal,
    customScript,
    language,
  });

  const { data: knowledgeBase, error: upsertError } = await supabase
    .from("knowledge_bases")
    .upsert(
      [
        {
          tenant_id: tenantId,
          business_name: training.draft.business_name,
          website_url: websiteUrl || null,
          google_maps_url: googleMapsUrl || null,
          call_goal: callGoal || null,
          language: training.draft.language,
          business_profile: training.draft.business_profile,
          faqs: training.draft.faqs,
          opening_script: training.draft.opening_script,
          closing_script: training.draft.closing_script,
          custom_script: customScript || null,
          source_text: training.sourceText || null,
          status: "ready",
          trained_at: new Date().toISOString(),
          created_by: userData.user.id,
        },
      ],
      { onConflict: "tenant_id" }
    )
    .select()
    .single();

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    provider: training.provider,
    warnings: training.warnings,
    knowledge_base: knowledgeBase,
  });
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

  const { data, error } = await supabase
    .from("knowledge_bases")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, knowledge_base: data ?? null });
}
