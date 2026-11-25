export const KNOWLEDGE_LANGUAGES = ["hi-IN", "gu-IN", "en-IN"] as const;

export type KnowledgeLanguage = (typeof KNOWLEDGE_LANGUAGES)[number];

export type BusinessProfile = {
  industry: string;
  summary: string;
  services: string[];
  locations: string[];
  contact: string[];
  hours: string[];
  highlights: string[];
};

export type KnowledgeFaq = {
  question: string;
  answer: string;
};

export type KnowledgeDraft = {
  business_name: string;
  business_profile: BusinessProfile;
  faqs: KnowledgeFaq[];
  opening_script: string;
  closing_script: string;
  language: KnowledgeLanguage;
};

export type TrainKnowledgeInput = {
  businessName: string;
  websiteUrl: string;
  googleMapsUrl: string;
  callGoal: string;
  customScript: string;
  language: KnowledgeLanguage;
};

export type KnowledgeProvider = "groq" | "fallback";

export type TrainKnowledgeResult = {
  draft: KnowledgeDraft;
  provider: KnowledgeProvider;
  sourceText: string;
  warnings: string[];
};

type FetchLike = typeof fetch;

type TrainDependencies = {
  fetchImpl?: FetchLike;
  groqKey?: string;
};

type PageText = {
  text: string;
  source: "jina" | "direct" | "none";
  title: string;
  warning?: string;
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "qwen/qwen3.8-27b";
const JINA_PREFIX = "https://r.jina.ai/";
const MAX_SOURCE_CHARS = 30000;
const MAX_PAGE_CHARS = 20000;
const FETCH_TIMEOUT_MS = 12000;
const GROQ_TIMEOUT_MS = 25000;

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"]);

export function normalizeLanguage(value: unknown): KnowledgeLanguage {
  return (KNOWLEDGE_LANGUAGES as readonly string[]).includes(String(value))
    ? (value as KnowledgeLanguage)
    : "en-IN";
}

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  if ([first, second, Number(match[3]), Number(match[4])].some((part) => part > 255)) {
    return true;
  }
  if (first === 0 || first === 10 || first === 127) return true;
  if (first === 169 && second === 254) return true;
  if (first === 172 && second >= 16 && second <= 31) return true;
  if (first === 192 && second === 168) return true;
  if (first === 100 && second >= 64 && second <= 127) return true;
  return false;
}

export function isPublicHttpUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host)) {
    return false;
  }
  if (host.startsWith("[") || host.endsWith(".local") || host.endsWith(".internal")) {
    return false;
  }
  if (isPrivateIpv4(host)) {
    return false;
  }
  return true;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function extractHtmlTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 200) : "";
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchLike
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPageText(
  rawUrl: string,
  fetchImpl: FetchLike = fetch
): Promise<PageText> {
  if (!isPublicHttpUrl(rawUrl)) {
    return { text: "", source: "none", title: "", warning: "URL must be a public http(s) address." };
  }

  try {
    const response = await fetchWithTimeout(
      `${JINA_PREFIX}${rawUrl}`,
      { headers: { Accept: "text/plain" }, cache: "no-store" },
      FETCH_TIMEOUT_MS,
      fetchImpl
    );
    if (response.ok) {
      const text = (await response.text()).trim();
      if (text.length >= 80 && !/^(failed|error)\b/i.test(text)) {
        return {
          text: text.slice(0, MAX_PAGE_CHARS),
          source: "jina",
          title: extractJinaTitle(text),
        };
      }
    }
  } catch {
    // Fall through to a direct fetch.
  }

  try {
    const response = await fetchWithTimeout(
      rawUrl,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
          "User-Agent": "AI-Lead-Conversion-KnowledgeBot/1.0",
        },
        cache: "no-store",
      },
      FETCH_TIMEOUT_MS,
      fetchImpl
    );
    if (response.ok) {
      const body = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      const text = contentType.includes("html") ? htmlToText(body) : body.replace(/\s+/g, " ").trim();
      if (text) {
        return {
          text: text.slice(0, MAX_PAGE_CHARS),
          source: "direct",
          title: contentType.includes("html") ? extractHtmlTitle(body) : "",
        };
      }
    }
  } catch {
    return {
      text: "",
      source: "none",
      title: "",
      warning: "Could not reach the supplied URL.",
    };
  }

  return { text: "", source: "none", title: "", warning: "The supplied URL returned no readable text." };
}

function extractJinaTitle(text: string): string {
  const match = text.match(/^Title:\s*(.+)$/im);
  return match ? match[1].trim().slice(0, 200) : "";
}

function asString(value: unknown, maxLength = 600): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 160): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asString(item, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function sanitizeProfile(value: unknown): BusinessProfile {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    industry: asString(record.industry, 120),
    summary: asString(record.summary, 900),
    services: asStringArray(record.services),
    locations: asStringArray(record.locations),
    contact: asStringArray(record.contact),
    hours: asStringArray(record.hours),
    highlights: asStringArray(record.highlights),
  };
}

function sanitizeFaqs(value: unknown): KnowledgeFaq[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const faqs: KnowledgeFaq[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const question = asString(record.question, 240);
    const answer = asString(record.answer, 700);
    if (question && answer) {
      faqs.push({ question, answer });
    }
    if (faqs.length >= 8) {
      break;
    }
  }
  return faqs;
}

function fallbackBusinessName(input: TrainKnowledgeInput, title: string): string {
  const explicit = input.businessName.trim();
  if (explicit) {
    return explicit.slice(0, 200);
  }
  if (title) {
    return title.replace(/\s*[|·—-]\s*.*$/, "").trim().slice(0, 200) || title.slice(0, 200);
  }
  const candidate = input.websiteUrl || input.googleMapsUrl;
  if (candidate) {
    try {
      const host = new URL(candidate).hostname.replace(/^www\./i, "");
      const label = host.split(".")[0].replace(/[-_]+/g, " ");
      if (label) {
        return label.replace(/\b\w/g, (char) => char.toUpperCase()).slice(0, 200);
      }
    } catch {
      // Ignore malformed URL and keep the generic name.
    }
  }
  return "Your Business";
}

function detectIndustry(text: string): string {
  const haystack = text.toLowerCase();
  const signals: Array<[RegExp, string]> = [
    [/clinic|hospital|doctor|dental|health/, "Healthcare"],
    [/gym|fitness|yoga|trainer/, "Fitness & wellness"],
    [/real estate|property|apartment|villa|plot/, "Real estate"],
    [/coaching|course|school|academy|tuition/, "Education & coaching"],
    [/car|bike|vehicle|dealership|automobile/, "Automotive"],
    [/salon|spa|beauty|hair/, "Beauty & personal care"],
    [/restaurant|cafe|food|catering/, "Food & hospitality"],
    [/agency|marketing|consulting|software|saas/, "Professional services"],
  ];
  for (const [pattern, label] of signals) {
    if (pattern.test(haystack)) {
      return label;
    }
  }
  return "General business";
}

function greeting(language: KnowledgeLanguage): string {
  if (language === "hi-IN") return "Namaste";
  if (language === "gu-IN") return "Namaste";
  return "Hello";
}

function buildFaqs(name: string, profile: BusinessProfile, input: TrainKnowledgeInput): KnowledgeFaq[] {
  const offerings =
    profile.services.length > 0
      ? profile.services.join(", ")
      : profile.summary || `${name} can share the latest details about its offerings.`;
  const location =
    profile.locations.length > 0
      ? profile.locations.join(", ")
      : "Our team can share the exact location and directions.";
  const goal = input.callGoal.trim() || "your recent enquiry";
  return [
    { question: `What does ${name} offer?`, answer: offerings },
    { question: `Where is ${name} located?`, answer: location },
    {
      question: `How can I get started with ${name}?`,
      answer: `Our team will confirm availability and next steps for ${goal}.`,
    },
    {
      question: "Do you have current pricing and availability?",
      answer: "Pricing and availability change often. Our team will confirm the latest details before you commit.",
    },
  ];
}

export function buildFallbackKnowledge(
  input: TrainKnowledgeInput,
  sourceText: string,
  title = ""
): KnowledgeDraft {
  const name = fallbackBusinessName(input, title);
  const cleanedSource = sourceText.replace(/\s+/g, " ").trim();
  const summary = cleanedSource
    ? cleanedSource.slice(0, 420)
    : `${name} uses an AI voice assistant to respond to customer enquiries and follow up on ${input.callGoal || "new leads"}.`;
  const profile: BusinessProfile = {
    industry: detectIndustry(cleanedSource),
    summary,
    services: [],
    locations: [],
    contact: [],
    hours: [],
    highlights: [],
  };
  const hello = greeting(input.language);
  const goal = input.callGoal.trim() || "your recent enquiry";
  const opening =
    input.customScript.trim() ||
    `${hello}, this is the AI assistant from ${name}. I am calling about ${goal}. Is now a good time to talk?`;
  const closing =
    "Thank you for your time. Our team will follow up with the confirmed details. Have a great day.";
  return {
    business_name: name,
    business_profile: profile,
    faqs: buildFaqs(name, profile, input),
    opening_script: opening.slice(0, 1200),
    closing_script: closing,
    language: input.language,
  };
}

function resolveGroqKey(explicit?: string): string {
  const value = (explicit ?? process.env.GROQ_API_KEY ?? process.env.GROQ_KEY ?? "").trim();
  if (!value || /^(REPLACE_ME|YOUR_|CHANGE_ME|PLACEHOLDER|<)/i.test(value)) {
    return "";
  }
  return value;
}

type GroqPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function extractWithGroq(
  input: TrainKnowledgeInput,
  sourceText: string,
  deps: TrainDependencies = {}
): Promise<KnowledgeDraft | null> {
  const apiKey = resolveGroqKey(deps.groqKey);
  if (!apiKey) {
    return null;
  }

  const system = [
    "You build structured knowledge bases for a multilingual AI voice agent.",
    "Use ONLY the supplied business context. Never invent prices, availability, guarantees, or contact details.",
    "If a fact is missing, leave the field empty instead of guessing.",
    "Reply with a single JSON object using this shape:",
    '{"business_name":string,"business_profile":{"industry":string,"summary":string,"services":string[],"locations":string[],"contact":string[],"hours":string[],"highlights":string[]},"faqs":[{"question":string,"answer":string}],"opening_script":string,"closing_script":string}',
    "Keep opening_script to 1-2 conversational sentences and closing_script to one sentence.",
  ].join(" ");

  const user = [
    `Business name hint: ${input.businessName || "(unknown)"}`,
    `Website: ${input.websiteUrl || "(none)"}`,
    `Google Maps: ${input.googleMapsUrl || "(none)"}`,
    `Call goal: ${input.callGoal || "(not provided)"}`,
    `Preferred language: ${input.language}`,
    `Custom script: ${input.customScript || "(none)"}`,
    "Business context:",
    sourceText ? sourceText.slice(0, 12000) : "(no website text available)",
  ].join("\n");

  try {
    const response = await fetchWithTimeout(
      GROQ_ENDPOINT,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.2,
          max_tokens: 1800,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      },
      GROQ_TIMEOUT_MS,
      deps.fetchImpl ?? fetch
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GroqPayload;
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      return null;
    }

    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    const jsonText =
      firstBrace >= 0 && lastBrace > firstBrace
        ? content.slice(firstBrace, lastBrace + 1)
        : content;
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const fallback = buildFallbackKnowledge(input, sourceText);
    const businessName = asString(parsed.business_name, 200) || fallback.business_name;
    const profile = sanitizeProfile(parsed.business_profile);
    const faqs = sanitizeFaqs(parsed.faqs);

    if (!profile.industry) profile.industry = fallback.business_profile.industry;
    if (!profile.summary) profile.summary = fallback.business_profile.summary;
    if (profile.services.length === 0) profile.services = fallback.business_profile.services;
    if (profile.locations.length === 0) profile.locations = fallback.business_profile.locations;

    return {
      business_name: businessName,
      business_profile: profile,
      faqs: faqs.length > 0 ? faqs : fallback.faqs,
      opening_script: asString(parsed.opening_script, 1200) || fallback.opening_script,
      closing_script: asString(parsed.closing_script, 600) || fallback.closing_script,
      language: input.language,
    };
  } catch {
    return null;
  }
}

export async function trainKnowledgeBase(
  input: TrainKnowledgeInput,
  deps: TrainDependencies = {}
): Promise<TrainKnowledgeResult> {
  const warnings: string[] = [];
  const chunks: string[] = [];
  let title = "";

  if (input.websiteUrl) {
    const page = await fetchPageText(input.websiteUrl, deps.fetchImpl ?? fetch);
    if (page.text) {
      title = title || page.title;
      chunks.push(`Website (${page.source}):\n${page.text}`);
    } else if (page.warning) {
      warnings.push(`Website: ${page.warning}`);
    }
  }

  if (input.googleMapsUrl) {
    const page = await fetchPageText(input.googleMapsUrl, deps.fetchImpl ?? fetch);
    if (page.text) {
      title = title || page.title;
      chunks.push(`Google Maps context:\n${page.text}`);
    } else if (page.warning) {
      warnings.push(`Google Maps: ${page.warning}`);
    }
  }

  const sourceText = chunks.join("\n\n").slice(0, MAX_SOURCE_CHARS);
  const groqDraft = await extractWithGroq(input, sourceText, deps);
  if (groqDraft) {
    return { draft: groqDraft, provider: "groq", sourceText, warnings };
  }

  warnings.push(
    resolveGroqKey(deps.groqKey)
      ? "Groq extraction failed; used the deterministic fallback extractor."
      : "Groq is not configured; used the deterministic fallback extractor."
  );

  return {
    draft: buildFallbackKnowledge(input, sourceText, title),
    provider: "fallback",
    sourceText,
    warnings,
  };
}
