export type PlivoConfig = {
  authId: string;
  authToken: string;
  sourceNumber: string;
  answerUrl: string;
};

export type PlacePlivoCallInput = {
  to: string;
  answerUrl: string;
};

export type PlacePlivoCallResult = {
  ok: boolean;
  providerCallId?: string;
  error?: string;
};

type PlivoDependencies = {
  fetchImpl?: typeof fetch;
  config?: PlivoConfig | null;
  timeoutMs?: number;
};

const PLIVO_CALL_ENDPOINT = "https://api.plivo.com/v1/Account";
const PLIVO_TIMEOUT_MS = 12000;

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

export function getPlivoConfig(env: NodeJS.ProcessEnv = process.env): PlivoConfig | null {
  const authId = readEnv(env.PLIVO_AUTH_ID);
  const authToken = readEnv(env.PLIVO_AUTH_TOKEN);
  const sourceNumber = readEnv(env.PLIVO_SOURCE_NUMBER);
  const answerUrl = readEnv(env.PLIVO_ANSWER_URL);

  if (!authId || !authToken || !sourceNumber || !isHttpUrl(answerUrl)) {
    return null;
  }

  return { authId, authToken, sourceNumber, answerUrl };
}

export function normalizePlivoNumber(raw: unknown): string {
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
  const requestUuid = record.request_uuid;
  if (typeof requestUuid === "string") {
    return requestUuid;
  }
  if (Array.isArray(requestUuid) && typeof requestUuid[0] === "string") {
    return requestUuid[0];
  }
  return undefined;
}

function readProviderError(payload: unknown, status: number): string {
  if (typeof payload === "object" && payload !== null) {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
  }
  return `Plivo call failed (HTTP ${status})`;
}

export async function placePlivoCall(
  input: PlacePlivoCallInput,
  deps: PlivoDependencies = {}
): Promise<PlacePlivoCallResult> {
  const config = deps.config ?? getPlivoConfig();
  if (!config) {
    return { ok: false, error: "Plivo is not configured" };
  }

  const destination = normalizePlivoNumber(input.to);
  if (!destination) {
    return { ok: false, error: "Destination phone number is not valid for Plivo" };
  }

  const answerUrl = isHttpUrl(input.answerUrl) ? input.answerUrl : config.answerUrl;
  const auth = Buffer.from(`${config.authId}:${config.authToken}`).toString("base64");
  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? PLIVO_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await (deps.fetchImpl ?? fetch)(
      `${PLIVO_CALL_ENDPOINT}/${encodeURIComponent(config.authId)}/Call/`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: config.sourceNumber,
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
    const message = error instanceof Error ? error.message : "Plivo call failed";
    return { ok: false, error: message };
  } finally {
    clearTimeout(timer);
  }
}
