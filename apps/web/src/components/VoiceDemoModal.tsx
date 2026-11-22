"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type VoiceLanguage = "hi-IN" | "gu-IN" | "en-IN";

type VoiceTurn = {
  role: "customer" | "assistant";
  content: string;
};

type VoiceResponse = {
  ok?: boolean;
  reply?: string;
  language?: VoiceLanguage;
  voice?: string;
  provider?: "groq" | "fallback";
  grounded?: boolean;
  audio_base64?: string | null;
  audio_mime_type?: string;
  tts_provider?: "edge-tts" | "unavailable";
  warnings?: string[];
  error?: string;
};

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  "en-IN": "English (India)",
  "hi-IN": "Hindi",
  "gu-IN": "Gujarati",
};

const DEFAULT_MESSAGES: Record<VoiceLanguage, string> = {
  "en-IN": "Hello, what services do you offer?",
  "hi-IN": "नमस्ते, आप कौन सी सेवाएँ प्रदान करते हैं?",
  "gu-IN": "નમસ્તે, તમે કઈ સેવાઓ આપો છો?",
};

function readAuthToken(): string {
  try {
    const key = Object.keys(window.localStorage).find((item) => item.indexOf("auth-token") !== -1);
    if (!key) return "";
    const raw = window.localStorage.getItem(key);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as {
      access_token?: string;
      currentSession?: { access_token?: string };
    };
    if (parsed?.access_token) return parsed.access_token;
    if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
    return "";
  } catch {
    return "";
  }
}

export default function VoiceDemoModal() {
  const [open, setOpen] = useState(false);
  const [language, setLanguage] = useState<VoiceLanguage>("en-IN");
  const [message, setMessage] = useState(DEFAULT_MESSAGES["en-IN"]);
  const [turns, setTurns] = useState<VoiceTurn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [audioSrc, setAudioSrc] = useState("");
  const [meta, setMeta] = useState<VoiceResponse | null>(null);

  function close() {
    setOpen(false);
    setPending(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function handleLanguageChange(value: VoiceLanguage) {
    setLanguage(value);
    setMessage(DEFAULT_MESSAGES[value]);
    setTurns([]);
    setAudioSrc("");
    setMeta(null);
    setError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = message.trim();
    if (!text || pending) return;

    setPending(true);
    setError("");
    setAudioSrc("");
    setMeta(null);

    const history = turns.slice(-6);
    const nextTurns: VoiceTurn[] = [...turns, { role: "customer", content: text }];

    try {
      const token = readAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;

      const response = await fetch("/api/voice/respond", {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          language,
          history,
          generate_audio: true,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as VoiceResponse;

      if (!response.ok || !data.ok || !data.reply) {
        setError(data.error || `Voice agent request failed (HTTP ${response.status}).`);
        return;
      }

      setTurns([...nextTurns, { role: "assistant", content: data.reply }]);
      setMeta(data);
      if (data.audio_base64) {
        setAudioSrc(`data:${data.audio_mime_type || "audio/mpeg"};base64,${data.audio_base64}`);
      }
    } catch {
      setError("Could not reach the voice agent.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="voice-demo">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold">Test AI Voice (Live Demo)</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Multilingual replies grounded in your trained knowledge base
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          data-testid="voice-demo-open"
        >
          Test AI Voice (Live Demo)
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="voice-demo-title">
          <div className="absolute inset-0 bg-slate-900/50" onClick={close} aria-hidden="true" />
          <div className="relative w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
              <div>
                <h2 id="voice-demo-title" className="text-base font-semibold text-slate-900">
                  Test AI Voice (Live Demo)
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  No real calls are placed. Audio is generated locally with edge-tts.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close voice demo"
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <label className="mt-4 block text-xs font-medium text-slate-600" htmlFor="voice-demo-language">
              Agent language
            </label>
            <select
              id="voice-demo-language"
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value as VoiceLanguage)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {(Object.keys(LANGUAGE_LABELS) as VoiceLanguage[]).map((option) => (
                <option key={option} value={option}>
                  {LANGUAGE_LABELS[option]}
                </option>
              ))}
            </select>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3" data-testid="voice-demo-log">
              {turns.length === 0 ? (
                <p className="text-xs text-slate-500">Send a message to hear the AI agent respond.</p>
              ) : (
                turns.map((turn, index) => (
                  <p
                    key={`${turn.role}-${index}`}
                    className={turn.role === "assistant" ? "text-sm text-slate-900" : "text-sm text-slate-600"}
                  >
                    <span className="font-semibold">
                      {turn.role === "assistant" ? "AI Agent: " : "You: "}
                    </span>
                    {turn.content}
                  </p>
                ))
              )}
            </div>

            {audioSrc && (
              <audio controls src={audioSrc} className="mt-3 w-full" aria-label="AI agent reply audio" data-testid="voice-demo-audio" />
            )}
            {meta && (
              <p className="mt-2 text-xs text-slate-500" role="status">
                {meta.voice} · replies by {meta.provider} · speech by {meta.tts_provider}
                {meta.grounded ? " · grounded in your knowledge base" : " · no knowledge base trained"}
              </p>
            )}
            {meta?.warnings && meta.warnings.length > 0 && (
              <p className="mt-2 text-xs text-amber-700" role="status">
                {meta.warnings.join(" ")}
              </p>
            )}
            {error && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}

            <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
              <input
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={1000}
                aria-label="Customer message"
                placeholder="Type a customer message"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={pending || !message.trim()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {pending ? "Speaking…" : "Send"}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
