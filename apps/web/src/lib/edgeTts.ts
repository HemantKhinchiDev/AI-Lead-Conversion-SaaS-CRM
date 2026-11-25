import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { resolveVoice, type VoiceGender, type VoiceLanguage } from "./voiceBrain";

const execFileAsync = promisify(execFile);

const MAX_TTS_CHARS = 600;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_SPEECH_RATE = "+18%";
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const EDGE_TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_CHROMIUM_FULL_VERSION = "143.0.3650.75";
const EDGE_SEC_MS_GEC_VERSION = `1-${EDGE_CHROMIUM_FULL_VERSION}`;
const EDGE_WSS_ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const EDGE_WSS_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/${EDGE_CHROMIUM_FULL_VERSION}`;
const WIN_EPOCH_OFFSET_SEC = 11644473600;
const S_TO_NS = 1000000000;

export type TtsResult = {
  audioBase64: string | null;
  mimeType: "audio/mpeg";
  provider: "edge-tts" | "unavailable";
  voice: string;
  warning?: string;
};

type TtsDependencies = {
  command?: string;
  timeoutMs?: number;
  gender?: VoiceGender;
  rate?: string;
};

type CommandCandidate = {
  bin: string;
  args: string[];
};

function isMissingCommand(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (error as { code?: unknown }).code === "ENOENT";
}

function buildCandidates(
  command: string | undefined,
  voice: string,
  text: string,
  file: string,
  rate: string
): CommandCandidate[] {
  const cliArgs = [
    "--voice",
    voice,
    "--text",
    text,
    "--rate",
    rate,
    "--write-media",
    file,
  ];
  const configured = (command ?? "").trim();
  if (configured) {
    return [{ bin: configured, args: cliArgs }];
  }
  return [
    { bin: "edge-tts", args: cliArgs },
    { bin: "python3", args: ["-m", "edge_tts", ...cliArgs] },
  ];
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function generateSecMsGec(): string {
  const nowSec = Math.floor(Date.now() / 1000) + WIN_EPOCH_OFFSET_SEC;
  const roundedSec = nowSec - (nowSec % 300);
  const strToHash = `${roundedSec}${EDGE_TRUSTED_CLIENT_TOKEN}`;
  return createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
}

function createRequestId(): string {
  return randomUUID().replace(/-/g, "");
}

function buildEdgeWssUrl(): string {
  const secMsGec = generateSecMsGec();
  const reqId = createRequestId();
  return (
    `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1` +
    `?TrustedClientToken=${EDGE_TRUSTED_CLIENT_TOKEN}` +
    `&Sec-MS-GEC=${secMsGec}` +
    `&Sec-MS-GEC-Version=${encodeURIComponent(EDGE_SEC_MS_GEC_VERSION)}` +
    `&ConnectionId=${reqId}`
  );
}

function extractBinaryMp3Chunk(data: Buffer): Buffer | null {
  const separator = Buffer.from("Path:audio\r\n");
  const idx = data.indexOf(separator);
  if (idx === -1) {
    return null;
  }
  const chunk = data.subarray(idx + separator.length);
  return chunk.byteLength > 0 ? chunk : null;
}

async function synthesizeViaNodeWebSocket(
  text: string,
  voice: string,
  rate: string,
  timeoutMs: number
): Promise<{ audioBase64: string; mimeType: "audio/mpeg" } | null> {
  const WebSocketCtor = (globalThis as {
    WebSocket?: new (
      url: string,
      options?: { headers?: Record<string, string> }
    ) => {
      binaryType: string;
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onclose: (() => void) | null;
      send: (data: string) => void;
      close: () => void;
    };
  }).WebSocket;

  if (typeof WebSocketCtor !== "function") {
    return null;
  }

  const wssUrl = buildEdgeWssUrl();
  const reqId = createRequestId();
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
    `<voice name='${escapeSsml(voice)}'>` +
    `<prosody pitch='+0Hz' rate='${escapeSsml(rate)}' volume='+0%'>` +
    `${escapeSsml(text)}` +
    `</prosody></voice></speak>`;

  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let settled = false;

    const finish = (result: { audioBase64: string; mimeType: "audio/mpeg" } | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      if (chunks.length > 0) {
        const merged = Buffer.concat(chunks);
        if (merged.byteLength >= 512) {
          finish({
            audioBase64: merged.toString("base64"),
            mimeType: "audio/mpeg",
          });
          return;
        }
      }
      finish(null);
    }, Math.min(Math.max(timeoutMs, 4000), 12000));

    const ws = new WebSocketCtor(wssUrl, {
      headers: {
        Origin: EDGE_WSS_ORIGIN,
        "User-Agent": EDGE_WSS_USER_AGENT,
      },
    });
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      const configMsg =
        `X-Timestamp:${new Date().toISOString()}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataOptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        });
      ws.send(configMsg);

      const ssmlMsg =
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${new Date().toISOString()}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml;
      ws.send(ssmlMsg);
    };

    ws.onmessage = async (event) => {
      const rawData = event.data;
      if (typeof rawData === "string") {
        if (rawData.includes("Path:turn.end")) {
          const merged = Buffer.concat(chunks);
          if (merged.byteLength >= 512) {
            finish({
              audioBase64: merged.toString("base64"),
              mimeType: "audio/mpeg",
            });
          } else {
            finish(null);
          }
        }
        return;
      }

      let buf: Buffer | null = null;
      if (rawData instanceof ArrayBuffer) {
        buf = Buffer.from(rawData);
      } else if (ArrayBuffer.isView(rawData)) {
        buf = Buffer.from(rawData.buffer, rawData.byteOffset, rawData.byteLength);
      } else if (rawData && typeof (rawData as { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === "function") {
        const ab = await (rawData as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer();
        buf = Buffer.from(ab);
      }

      if (buf && buf.byteLength > 0) {
        const audioChunk = extractBinaryMp3Chunk(buf);
        if (audioChunk) {
          chunks.push(audioChunk);
        }
      }
    };

    ws.onerror = () => {
      finish(null);
    };

    ws.onclose = () => {
      if (!settled) {
        const merged = Buffer.concat(chunks);
        if (merged.byteLength >= 512) {
          finish({
            audioBase64: merged.toString("base64"),
            mimeType: "audio/mpeg",
          });
        } else {
          finish(null);
        }
      }
    };
  });
}

async function synthesizeViaVpsBridge(
  text: string,
  language: VoiceLanguage,
  voice: string,
  rate: string
): Promise<{ audioBase64: string; mimeType: "audio/mpeg" } | null> {
  const rawUrl = process.env.VPS_EDGE_TTS_URL?.trim().replace(/\/+$/, "") || "";
  if (!rawUrl) return null;
  const endpointUrl = rawUrl.endsWith("/tts") ? rawUrl : `${rawUrl}/tts`;
  const secret = process.env.TTS_BRIDGE_SECRET?.trim() || "";
  try {
    const u = new URL(endpointUrl);
    if (secret) {
      u.searchParams.set("key", secret);
    }
    u.searchParams.set("lang", language);
    u.searchParams.set("voice", voice);
    u.searchParams.set("rate", rate);
    u.searchParams.set("text", text.slice(0, MAX_TTS_CHARS));
    const res = await fetch(u.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return null;
    const arr = await res.arrayBuffer();
    if (!arr || arr.byteLength < 1000) return null;
    return {
      audioBase64: Buffer.from(arr).toString("base64"),
      mimeType: "audio/mpeg",
    };
  } catch {
    return null;
  }
}

export async function synthesizeSpeech(
  text: string,
  language: VoiceLanguage,
  deps: TtsDependencies = {}
): Promise<TtsResult> {
  const voice = resolveVoice(language, deps.gender ?? "female");
  const rate = (deps.rate ?? DEFAULT_SPEECH_RATE).trim() || DEFAULT_SPEECH_RATE;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_TTS_CHARS);

  if (!clean) {
    return {
      audioBase64: null,
      mimeType: "audio/mpeg",
      provider: "unavailable",
      voice,
      warning: "No text was available for speech synthesis.",
    };
  }

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const bridged = await synthesizeViaVpsBridge(clean, language, voice, rate);
  if (bridged && bridged.audioBase64) {
    return {
      audioBase64: bridged.audioBase64,
      mimeType: "audio/mpeg",
      provider: "edge-tts",
      voice,
    };
  }

  const wsResult = await synthesizeViaNodeWebSocket(clean, voice, rate, Math.min(timeoutMs, 5000));
  if (wsResult && wsResult.audioBase64) {
    return {
      audioBase64: wsResult.audioBase64,
      mimeType: "audio/mpeg",
      provider: "edge-tts",
      voice,
    };
  }

  const file = join(tmpdir(), `edge-tts-${randomUUID()}.mp3`);
  const candidates = buildCandidates(
    deps.command ?? process.env.EDGE_TTS_BIN,
    voice,
    clean,
    file,
    rate
  );

  try {
    for (const candidate of candidates) {
      try {
        await execFileAsync(candidate.bin, candidate.args, {
          timeout: timeoutMs,
          maxBuffer: MAX_OUTPUT_BYTES,
        });
        const buffer = await fs.readFile(file);
        if (buffer.byteLength > 0) {
          return {
            audioBase64: buffer.toString("base64"),
            mimeType: "audio/mpeg",
            provider: "edge-tts",
            voice,
          };
        }
      } catch (error) {
        if (isMissingCommand(error)) {
          continue;
        }
      }
    }
  } finally {
    await fs.unlink(file).catch(() => undefined);
  }

  return {
    audioBase64: null,
    mimeType: "audio/mpeg",
    provider: "unavailable",
    voice,
    warning: "edge-tts is not available. Install it with `pip install edge-tts`.",
  };
}
