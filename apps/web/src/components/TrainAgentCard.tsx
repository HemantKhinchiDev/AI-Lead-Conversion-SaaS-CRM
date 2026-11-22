"use client";

import { useState } from "react";
import type { FormEvent } from "react";

type KnowledgeFaq = {
  question?: string;
  answer?: string;
};

type KnowledgeBase = {
  business_name?: string | null;
  opening_script?: string | null;
  closing_script?: string | null;
  faqs?: KnowledgeFaq[];
  business_profile?: {
    industry?: string;
    summary?: string;
    services?: string[];
    locations?: string[];
  } | null;
};

type TrainResponse = {
  ok?: boolean;
  provider?: "groq" | "fallback";
  warnings?: string[];
  knowledge_base?: KnowledgeBase | null;
  error?: string;
};

function readAuthToken(): string {
  try {
    const key = Object.keys(window.localStorage).find((item) => item.indexOf("auth-token") !== -1);
    if (!key) return "";
    const raw = window.localStorage.getItem(key);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.access_token === "string") return parsed.access_token;
    if (parsed && parsed.currentSession && typeof parsed.currentSession.access_token === "string") {
      return parsed.currentSession.access_token;
    }
    return "";
  } catch {
    return "";
  }
}

export default function TrainAgentCard() {
  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [googleMapsUrl, setGoogleMapsUrl] = useState("");
  const [callGoal, setCallGoal] = useState("");
  const [customScript, setCustomScript] = useState("");
  const [language, setLanguage] = useState("en-IN");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<TrainResponse | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setStatus("");
    setResult(null);

    try {
      const token = readAuthToken();
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch("/api/kb/train", {
        method: "POST",
        headers,
        body: JSON.stringify({
          business_name: businessName,
          website_url: websiteUrl,
          google_maps_url: googleMapsUrl,
          call_goal: callGoal,
          custom_script: customScript,
          language,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as TrainResponse;

      if (!response.ok || data.error) {
        setError(data.error || `Could not train the AI agent (HTTP ${response.status}).`);
        return;
      }

      setResult(data);
      setStatus(
        data.provider === "groq"
          ? "Knowledge base trained with Groq. Your AI agent is ready."
          : "Knowledge base saved with the built-in extractor. Add a Groq key for richer training."
      );
    } catch {
      setError("Could not reach the knowledge base trainer.");
    } finally {
      setSubmitting(false);
    }
  }

  const knowledgeBase = result?.knowledge_base;
  const profile = knowledgeBase?.business_profile;
  const faqs = knowledgeBase?.faqs ?? [];

  return (
    <section className="dashboard-card" id="train-agent" aria-labelledby="train-agent-title" data-testid="train-agent">
      <div className="card-head">
        <div>
          <h2 className="card-title" id="train-agent-title">
            Train AI Agent
          </h2>
          <p className="card-subtitle">
            Works for any business · website + map context · grounded FAQs and call script
          </p>
        </div>
      </div>

      <form className="dash-form" onSubmit={handleSubmit}>
        <div className="dash-grid">
          <label className="dash-field">
            <span>Business name</span>
            <input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              placeholder="e.g. Sunrise Clinic"
              maxLength={200}
            />
          </label>
          <label className="dash-field">
            <span>Website URL</span>
            <input
              type="url"
              value={websiteUrl}
              onChange={(event) => setWebsiteUrl(event.target.value)}
              placeholder="https://example.com"
              maxLength={2048}
            />
          </label>
          <label className="dash-field">
            <span>Google Map link</span>
            <input
              type="url"
              value={googleMapsUrl}
              onChange={(event) => setGoogleMapsUrl(event.target.value)}
              placeholder="https://maps.app.goo.gl/..."
              maxLength={2048}
            />
          </label>
          <label className="dash-field">
            <span>Call goal</span>
            <input
              value={callGoal}
              onChange={(event) => setCallGoal(event.target.value)}
              placeholder="e.g. Book a consultation this week"
              maxLength={500}
            />
          </label>
          <label className="dash-field">
            <span>Agent language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)}>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi</option>
              <option value="gu-IN">Gujarati</option>
            </select>
          </label>
        </div>

        <label className="dash-field">
          <span>Script editor</span>
          <textarea
            className="dash-input"
            value={customScript}
            onChange={(event) => setCustomScript(event.target.value)}
            placeholder="Optional: paste the opening lines your AI agent should use."
            maxLength={4000}
            rows={4}
          />
        </label>

        <button className="btn btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Training…" : "Train AI Agent"}
        </button>
      </form>

      {error && (
        <p className="dash-message" data-state="error" role="alert">
          {error}
        </p>
      )}
      {status && (
        <p className="dash-message" data-state="success" role="status">
          {status}
        </p>
      )}
      {result?.warnings && result.warnings.length > 0 && (
        <p className="dash-message" role="status">
          {result.warnings.join(" ")}
        </p>
      )}

      {knowledgeBase && (
        <div className="dash-result">
          <h3>{knowledgeBase.business_name || "Knowledge base"}</h3>
          {profile?.industry && <p>Industry: {profile.industry}</p>}
          {profile?.summary && <p>{profile.summary}</p>}
          {profile?.services && profile.services.length > 0 && (
            <p>Services: {profile.services.join(", ")}</p>
          )}
          {profile?.locations && profile.locations.length > 0 && (
            <p>Locations: {profile.locations.join(", ")}</p>
          )}
          {knowledgeBase.opening_script && (
            <p>
              <strong>Opening:</strong> {knowledgeBase.opening_script}
            </p>
          )}
          {knowledgeBase.closing_script && (
            <p>
              <strong>Closing:</strong> {knowledgeBase.closing_script}
            </p>
          )}
          {faqs.length > 0 && (
            <div>
              <p>
                <strong>FAQs ({faqs.length})</strong>
              </p>
              <ul>
                {faqs.slice(0, 4).map((faq, index) => (
                  <li key={`${faq.question ?? "faq"}-${index}`}>
                    {faq.question}: {faq.answer}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
