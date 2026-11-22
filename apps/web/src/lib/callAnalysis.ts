export const CALL_OUTCOMES = [
  "INTERESTED",
  "NOT_INTERESTED",
  "CALLBACK_REQUESTED",
  "NO_ANSWER",
] as const;

export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export type CallAnalysisInput = {
  transcript?: unknown;
  full_transcript?: unknown;
  call_status?: unknown;
  lead_name?: unknown;
  language?: unknown;
};

export type CallAnalysis = {
  call_outcome: CallOutcome;
  callback_datetime: string | null;
  ai_summary: string;
  full_transcript: string;
  provider: "groq" | "fallback";
  warnings: string[];
};

type CallAnalysisDeps = {
  fetchImpl?: typeof fetch;
  groqKey?: string;
};

type GroqPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

type GroqExtract = {
  call_outcome: CallOutcome | null;
  callback_datetime: string | null;
  ai_summary: string;
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_TIMEOUT_MS = 12000;
const MAX_TRANSCRIPT_CHARS = 12000;
const MAX_SUMMARY_CHARS = 500;

const NO_ANSWER_STATUSES = new Set([
  "no_answer",
  "no-answer",
  "noanswer",
  "missed",
  "missed_call",
  "not_answered",
]);

function asText(value: unknown, maxLength = 600): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asTranscript(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TRANSCRIPT_CHARS);
}

export function sanitizeCallOutcome(value: unknown): CallOutcome | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  return CALL_OUTCOMES.find((outcome) => outcome === normalized) ?? null;
}

export function sanitizeIsoDatetime(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const candidate = value.trim();
  if (!candidate || !/\d{4}-\d{2}-\d{2}/.test(candidate)) {
    return null;
  }
  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return new Date(parsed).toISOString();
}

function resolveGroqKey(explicit?: string): string {
  const value = (explicit ?? process.env.GROQ_API_KEY ?? process.env.GROQ_KEY ?? "").trim();
  if (!value || /^(REPLACE_ME|YOUR_|CHANGE_ME|PLACEHOLDER|<)/i.test(value)) {
    return "";
  }
  return value;
}

function readCallbackDatetime(transcript: string): string | null {
  const clock = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i.exec(transcript);
  if (!clock) {
    return null;
  }

  let hour = Number(clock[1]);
  const minute = Number(clock[2] ?? "0");
  const meridiem = clock[3].toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) {
    return null;
  }
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  const date = new Date();
  if (/tomorrow|next day|कल|કાલે/i.test(transcript)) {
    date.setDate(date.getDate() + 1);
  }
  date.setHours(hour, minute, 0, 0);
  if (date.getTime() <= Date.now()) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString();
}

export function buildFallbackAnalysis(transcript: string, callStatus = ""): CallAnalysis {
  const status = asText(callStatus, 60).toLowerCase();
  const noAnswer =
    !transcript ||
    NO_ANSWER_STATUSES.has(status) ||
    /\bno answer\b|\bnot answered\b|\bvoicemail\b|\brang out\b|\bno one picked\b/i.test(transcript);
  const declined =
    /\bnot interested\b|\bno thanks\b|\bno thank you\b|\bnot looking\b|\bdo not (want|need)\b|\bdon't (want|need)\b|नहीं|નહીં/i.test(
      transcript
    );
  const interested =
    /\bi(?:'m| am) (?:very )?interested\b|\binterested\b|\byes\b|\bdefinitely\b|\bi want\b|\bi need\b|\blooking for\b|रुचि|दिलचस्पी|हाँ|हां|હા|રસ/i.test(
      transcript
    );
  const callback =
    /\bcall ?back\b|\bcallback\b|\bcall me\b|\bcontact me\b|संपर्क|कॉल|સંપર્ક|કૉલ/i.test(transcript);

  let callOutcome: CallOutcome;
  if (noAnswer) {
    callOutcome = "NO_ANSWER";
  } else if (declined) {
    callOutcome = "NOT_INTERESTED";
  } else if (interested) {
    callOutcome = "INTERESTED";
  } else if (callback) {
    callOutcome = "CALLBACK_REQUESTED";
  } else {
    callOutcome = "NOT_INTERESTED";
  }

  const summaries: Record<CallOutcome, string> = {
    INTERESTED: callback
      ? "Lead confirmed interest and requested a callback."
      : "Lead expressed interest in the offering.",
    NOT_INTERESTED: declined
      ? "Lead declined the offer and is not interested."
      : "No clear buying signal was captured; human review recommended.",
    CALLBACK_REQUESTED: "Lead requested a callback; no clear buying signal was captured.",
    NO_ANSWER: "Call was not answered; no conversation was captured.",
  };

  return {
    call_outcome: callOutcome,
    callback_datetime: callback ? readCallbackDatetime(transcript) : null,
    ai_summary: summaries[callOutcome],
    full_transcript: transcript,
    provider: "fallback",
    warnings: [],
  };
}

async function extractWithGroq(
  transcript: string,
  callStatus: string,
  language: string,
  deps: CallAnalysisDeps
): Promise<GroqExtract | null> {
  const apiKey = resolveGroqKey(deps.groqKey);
  if (!apiKey) {
    return null;
  }

  const system = [
    "You classify the outcome of a completed sales call for a CRM.",
    "Reply with a single JSON object using this shape:",
    '{"call_outcome":string,"callback_datetime":string,"ai_summary":string}',
    'call_outcome must be exactly one of "INTERESTED", "NOT_INTERESTED", "CALLBACK_REQUESTED", "NO_ANSWER".',
    "If the lead explicitly expresses interest, choose INTERESTED even when they also ask for a callback.",
    "callback_datetime must be a valid ISO 8601 date-time derived only from an agreed time in the transcript, or an empty string.",
    "ai_summary must be one short factual sentence.",
    "Use only the supplied transcript. Never invent prices, availability, appointments, names, or commitments.",
  ].join(" ");

  const user = [
    `Current UTC time: ${new Date().toISOString()}`,
    `Call status: ${callStatus || "(unknown)"}`,
    `Language: ${language || "(unknown)"}`,
    "Transcript:",
    transcript.slice(0, 8000) || "(empty transcript)",
  ].join("\n");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GROQ_TIMEOUT_MS);
  try {
    const response = await (deps.fetchImpl ?? fetch)(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });

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
      firstBrace >= 0 && lastBrace > firstBrace ? content.slice(firstBrace, lastBrace + 1) : content;
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;

    return {
      call_outcome: sanitizeCallOutcome(parsed.call_outcome),
      callback_datetime: sanitizeIsoDatetime(parsed.callback_datetime),
      ai_summary: asText(parsed.ai_summary, MAX_SUMMARY_CHARS),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function analyzeCall(
  input: CallAnalysisInput,
  deps: CallAnalysisDeps = {}
): Promise<CallAnalysis> {
  const transcript = asTranscript(input.full_transcript ?? input.transcript);
  const callStatus = asText(input.call_status, 60);
  const language = asText(input.language, 20);
  const fallback = buildFallbackAnalysis(transcript, callStatus);
  const warnings = [...fallback.warnings];

  const groqResult = await extractWithGroq(transcript, callStatus, language, deps);
  if (groqResult) {
    if (!groqResult.call_outcome) {
      warnings.push("Invalid Groq outcome; used the deterministic classifier.");
    }
    return {
      call_outcome: groqResult.call_outcome ?? fallback.call_outcome,
      callback_datetime: groqResult.callback_datetime ?? fallback.callback_datetime,
      ai_summary: groqResult.ai_summary || fallback.ai_summary,
      full_transcript: transcript,
      provider: "groq",
      warnings,
    };
  }

  warnings.push(
    resolveGroqKey(deps.groqKey)
      ? "Groq extraction failed; used the deterministic outcome extractor."
      : "Groq is not configured; used the deterministic outcome extractor."
  );

  return { ...fallback, warnings };
}

export function callOutcomeFields(analysis: CallAnalysis) {
  return {
    call_outcome: analysis.call_outcome,
    callback_datetime: analysis.callback_datetime,
    ai_summary: analysis.ai_summary,
    full_transcript: analysis.full_transcript,
  };
}
