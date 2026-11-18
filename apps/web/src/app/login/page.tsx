"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient, isSupabaseConfigured } from "../../lib/supabase";

type AuthMode = "sign_in" | "sign_up";

export default function LoginPage() {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<AuthMode>("sign_in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signedInEmail, setSignedInEmail] = useState("");

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active && data.session) {
          setSignedInEmail(data.session.user.email ?? "");
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [configured]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError("");
    setNotice("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error(
          "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        );
      }

      if (mode === "sign_up") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              business_name: businessName.trim(),
              full_name: fullName.trim(),
            },
          },
        });
        if (signUpError) {
          throw signUpError;
        }

        if (data.session) {
          router.push("/dashboard");
          router.refresh();
        } else {
          setNotice("Workspace created. Confirm your email, then sign in.");
          setMode("sign_in");
        }
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        throw signInError;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        setSignedInEmail("");
        setNotice("Signed out.");
        return;
      }
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
      setSignedInEmail("");
      setNotice("Signed out.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not sign out");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="panel">
        <h1>AI Lead Conversion</h1>
        <p className="subtitle">Sign in to your business workspace</p>

        <div className="auth-tabs" role="group" aria-label="Authentication mode">
          <button
            className="auth-tab"
            type="button"
            aria-pressed={mode === "sign_in"}
            onClick={() => switchMode("sign_in")}
          >
            Sign in
          </button>
          <button
            className="auth-tab"
            type="button"
            aria-pressed={mode === "sign_up"}
            onClick={() => switchMode("sign_up")}
          >
            Register business
          </button>
        </div>

        {!configured && (
          <p className="form-message" data-state="error" role="alert">
            Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.
          </p>
        )}

        {signedInEmail && (
          <div className="auth-session">
            <p className="value">Signed in as {signedInEmail}</p>
            <button className="button auth-secondary" type="button" onClick={handleSignOut} disabled={busy}>
              Sign out
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "sign_up" && (
            <>
              <label className="field">
                <span>Business name</span>
                <input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="organization"
                />
              </label>
              <label className="field">
                <span>Your name</span>
                <input
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                  minLength={2}
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
            </>
          )}
          <label className="field">
            <span>Email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              required
              autoComplete="email"
            />
          </label>
          <label className="field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              required
              minLength={8}
              autoComplete={mode === "sign_up" ? "new-password" : "current-password"}
            />
          </label>
          <button className="button" type="submit" disabled={busy || !configured}>
            {busy ? "Please wait…" : mode === "sign_up" ? "Create workspace" : "Sign in"}
          </button>
        </form>

        {error && (
          <p className="form-message" data-state="error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-message" data-state="success" role="status">
            {notice}
          </p>
        )}

        <p className="hint">Registration creates one isolated workspace owned by the registering user.</p>
        <p className="hint">
          <a href="/dashboard">Open the demo dashboard</a>
        </p>
      </section>
    </main>
  );
}
