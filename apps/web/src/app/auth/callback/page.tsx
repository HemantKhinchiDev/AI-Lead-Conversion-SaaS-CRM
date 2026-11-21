"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Verifying your email and signing you in...");

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      router.replace("/login");
      return;
    }

    const supabase = client;
    let active = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function handleCallback() {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }

        const { data } = await supabase.auth.getSession();
        if (active && data.session) {
          router.replace("/dashboard");
          return;
        }

        supabase.auth.onAuthStateChange(
          (event, session) => {
            if (active && (event === "SIGNED_IN" || session)) {
              router.replace("/dashboard");
            }
          }
        );

        
        timeoutId = setTimeout(() => {
          if (active) {
            setStatus("Verification complete. Redirecting to login...");
            router.replace("/login");
          }
        }, 3500);
      } catch (err) {
        if (active) {
          setStatus(err instanceof Error ? err.message : "Verification failed. Redirecting...");
          setTimeout(() => router.replace("/login"), 2000);
        }
      }
    }

    handleCallback();
    return () => {
      active = false;
      if (timeoutId) clearTimeout(timeoutId);
      // The onAuthStateChange subscription is cleaned up by the active=false flag
    };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-center shadow-lg">
        <p className="text-sm font-medium text-slate-200">{status}</p>
      </div>
    </main>
  );
}
