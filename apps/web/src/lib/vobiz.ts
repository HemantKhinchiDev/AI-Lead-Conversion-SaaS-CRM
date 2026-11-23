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
