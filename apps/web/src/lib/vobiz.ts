export type VobizConfig = {
  authId: string;
  authToken: string;
  fromNumber: string;
  answerUrl: string;
};

export type PlaceVobizCallInput = {
  to: string;
  answerUrl?: string;
};

export type PlaceVobizCallResult = {
  ok: boolean;
  providerCallId?: string;
  error?: string;
};

type VobizDependencies = {
  fetchImpl?: typeof fetch;
  config?: VobizConfig | null;
  timeoutMs?: number;
};

const VOBIZ_CALL_ENDPOINT = "https://api.vobiz.ai/api/v1/Account";
const VOBIZ_TIMEOUT_MS = 12000;

function readEnv(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed || /^(REPLACE_ME|YOUR_|CHANGE_ME|PLACEHOLDER|<)/i.test(trimmed)) {
    return "";
  }
  return trimmed;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getVobizConfig(env: NodeJS.ProcessEnv = process.env): VobizConfig | null {
  const authId = readEnv(env.VOBIZ_AUTH_ID);
  const authToken = readEnv(env.VOBIZ_AUTH_TOKEN);
  const fromNumber = readEnv(env.VOBIZ_FROM_NUMBER);
  const answerUrl = readEnv(env.VOBIZ_ANSWER_URL);

  if (!authId || !authToken || !fromNumber) {
    return null;
  }

  return { authId, authToken, fromNumber, answerUrl };
}

export function normalizeVobizNumber(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  const compact = raw.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{8,15}$/.test(compact)) {
    return "";
  }
  const digits = compact.replace(/^\+/, "");
  if (digits.length === 10) {
    return `+91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `+91${digits.slice(1)}`;
  }
  return `+${digits}`;
}

function readProviderCallId(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  for (const key of ["request_uuid", "call_uuid", "api_id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }
  return undefined;
}

function readProviderError(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "error_message"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  }
  return `Vobiz call failed (HTTP ${status})`;
}

const VOBIZ_API_BASE_URL = "https://api.vobiz.ai/api/v1";
const VOBIZ_CALLS_PATH = "/calls";
const DEFAULT_EDGE_TTS_VOICE = "en-IN-NeerjaNeural";

export type VobizApiConfig = {
  apiKey: string;
  accountId: string;
  fromNumber: string;
  groqKey: string;
  edgeVoice: string;
};

export type VobizCallRequest = {
  to: string;
  answerUrl: string;
};

export type VobizCallDispatch = {
  ok: boolean;
  provider: "vobiz" | "sandbox_voice_sim";
  mode: "live" | "simulated";
  providerCallId?: string;
  error?: string;
  warning?: string;
};

type VobizDispatchDependencies = {
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

export type VobizXmlInput = {
  text: string;
  voice?: string;
  gender?: "female" | "male";
  speakVoice?: "WOMAN" | "MAN";
  prompt?: string;
  actionUrl?: string;
  audioUrl?: string;
  end?: boolean;
};

export type VobizWebhookEvent = {
  providerCallId: string;
  callStatus: string;
  dtmf: string;
  speech: string;
  hangup: boolean;
  payload: Record<string, unknown>;
};

export function getVobizApiConfig(
  env: NodeJS.ProcessEnv = process.env
): VobizApiConfig | null {
  const apiKey = readEnv(env.VOBIZ_API_KEY) || readEnv(env.VOBIZ_AUTH_TOKEN);
  const accountId = readEnv(env.VOBIZ_ACCOUNT_ID) || readEnv(env.VOBIZ_AUTH_ID);
  const fromNumber = readEnv(env.VOBIZ_FROM_NUMBER);
  if (!apiKey || !accountId || !fromNumber) {
    return null;
  }
  return {
    apiKey,
    accountId,
    fromNumber,
    groqKey: readEnv(env.GROQ_API_KEY),
    edgeVoice: readEnv(env.EDGE_TTS_VOICE) || DEFAULT_EDGE_TTS_VOICE,
  };
}

export function simulatedVobizDispatch(reason: string): VobizCallDispatch {
  return {
    ok: true,
    provider: "sandbox_voice_sim",
    mode: "simulated",
    warning: reason,
  };
}

export async function startVobizCall(
  input: VobizCallRequest,
  deps: VobizDispatchDependencies = {}
): Promise<VobizCallDispatch> {
  const config = getVobizApiConfig(deps.env ?? process.env);
  if (!config) {
    return simulatedVobizDispatch(
      "Vobiz API credentials are not configured; used simulated provider."
    );
  }

  const destination = normalizeVobizNumber(input.to);
  if (!destination) {
    return {
      ok: false,
      provider: "vobiz",
      mode: "live",
      error: "Destination phone number is not valid for Vobiz",
    };
  }

  const answerUrl = (input.answerUrl ?? "").trim();
  if (!isHttpUrl(answerUrl)) {
    return {
      ok: false,
      provider: "vobiz",
      mode: "live",
      error: "Vobiz answer URL is not configured",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? VOBIZ_TIMEOUT_MS);
  try {
    const response = await (deps.fetchImpl ?? fetch)(
      `${VOBIZ_API_BASE_URL}${VOBIZ_CALLS_PATH}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "X-Account-ID": config.accountId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_id: config.accountId,
          from: config.fromNumber,
          to: destination,
          answer_url: answerUrl,
          answer_method: "POST",
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        provider: "vobiz",
        mode: "live",
        error: readProviderError(payload, response.status),
      };
    }

    return {
      ok: true,
      provider: "vobiz",
      mode: "live",
      providerCallId: readProviderCallId(payload),
    };
  } catch (error) {
    return {
      ok: false,
      provider: "vobiz",
      mode: "live",
      error: error instanceof Error ? error.message : "Vobiz call failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

export function escapeVobizXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const VOBIZ_SPEAK_VOICE = "WOMAN";

export function resolveVobizSpeakVoice(gender?: "female" | "male"): "WOMAN" | "MAN" {
  return gender === "male" ? "MAN" : "WOMAN";
}

export function vobizSpeak(text: string, speakVoice?: "WOMAN" | "MAN"): string {
  return `<Speak voice="${speakVoice ?? VOBIZ_SPEAK_VOICE}">${escapeVobizXml(text)}</Speak>`;
}

export function buildVobizXml(input: VobizXmlInput): string {
  const speakVoice = input.speakVoice ?? resolveVobizSpeakVoice(input.gender);
  const speak = vobizSpeak(input.text, speakVoice);
  if (input.end || !input.actionUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response>${speak}<Hangup/></Response>`;
  }

  const audio = input.audioUrl ? `<Play>${escapeVobizXml(input.audioUrl)}</Play>` : speak;
  const record = `<Record action="${escapeVobizXml(input.actionUrl)}" method="POST" maxLength="10" timeout="1" retries="0" playBeep="false" finishOnKey="#"/>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${audio}${record}</Response>`;
}

export function buildGroqEdgeTtsVobizXml(
  input: VobizXmlInput & { groqKey?: string; ttsAudioUrl?: string }
): string {
  const config = getVobizApiConfig();
  const groqKey = input.groqKey || config?.groqKey || "";
  const text = groqKey
    ? input.text
    : "Thank you for your time. Our team will follow up with the confirmed details.";
  return buildVobizXml({
    ...input,
    text,
    audioUrl: input.ttsAudioUrl || input.audioUrl,
  });
}

function asVobizPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return Object.fromEntries(new URLSearchParams(trimmed));
    }
    return Object.fromEntries(new URLSearchParams(trimmed));
  }
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function readVobizField(payload: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function handleVobizWebhook(payload: unknown): VobizWebhookEvent {
  const record = asVobizPayload(payload);
  const callStatus = readVobizField(record, ["CallStatus", "call_status", "status"]);
  const event = readVobizField(record, ["Event", "event", "type"]);
  const normalizedStatus = (callStatus || event).toLowerCase();
  const hangup =
    /hangup|completed|done|ended|no-answer|no_answer|busy|failed/.test(normalizedStatus) ||
    /hangup|completed|done|ended/.test(event.toLowerCase());

  return {
    providerCallId: readProviderCallId(record) ?? "",
    callStatus: normalizedStatus,
    dtmf: readVobizField(record, ["Digits", "digits", "dtmf", "DTMF"]),
    speech: readVobizField(record, [
      "Speech",
      "speech",
      "SpeechText",
      "speech_text",
      "recognition_text",
      "utterance",
    ]),
    hangup,
    payload: record,
  };
}

export async function placeVobizCall(
  input: PlaceVobizCallInput,
  deps: VobizDependencies = {}
): Promise<PlaceVobizCallResult> {
  const config = deps.config ?? getVobizConfig();
  if (!config) {
    return { ok: false, error: "Vobiz is not configured" };
  }

  const destination = normalizeVobizNumber(input.to);
  if (!destination) {
    return { ok: false, error: "Destination phone number is not valid for Vobiz" };
  }

  const requestedAnswerUrl = (input.answerUrl ?? "").trim();
  const answerUrl = isHttpUrl(requestedAnswerUrl) ? requestedAnswerUrl : config.answerUrl;
  if (!isHttpUrl(answerUrl)) {
    return { ok: false, error: "Vobiz answer URL is not configured" };
  }

  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? VOBIZ_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (deps.fetchImpl ?? fetch)(
      `${VOBIZ_CALL_ENDPOINT}/${encodeURIComponent(config.authId)}/Call/`,
      {
        method: "POST",
        headers: {
          "X-Auth-ID": config.authId,
          "X-Auth-Token": config.authToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.fromNumber,
          to: destination,
          answer_url: answerUrl,
          answer_method: "POST",
        }),
        signal: controller.signal,
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, error: readProviderError(payload, response.status) };
    }

    return { ok: true, providerCallId: readProviderCallId(payload) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vobiz call failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
