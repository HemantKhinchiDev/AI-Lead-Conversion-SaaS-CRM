import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

let browserClient: SupabaseClient | null = null;

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isSupabaseConfigured(): boolean {
  return isValidSupabaseUrl(supabaseUrl) && supabaseAnonKey.length > 0;
}

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }

  if (!browserClient) {
    const isBrowser = typeof window !== "undefined";
    try {
      browserClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: isBrowser,
          autoRefreshToken: isBrowser,
          detectSessionInUrl: isBrowser,
        },
      });
    } catch {
      return null;
    }
  }

  return browserClient;
}
