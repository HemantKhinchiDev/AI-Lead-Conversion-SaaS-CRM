import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { VOICE_PROFILES, type VoiceLanguage } from "./voiceBrain";

const execFileAsync = promisify(execFile);

const MAX_TTS_CHARS = 600;
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

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
  file: string
): CommandCandidate[] {
  const cliArgs = ["--voice", voice, "--text", text, "--write-media", file];
  const configured = (command ?? "").trim();
  if (configured) {
    return [{ bin: configured, args: cliArgs }];
  }
  return [
    { bin: "edge-tts", args: cliArgs },
    { bin: "python3", args: ["-m", "edge_tts", ...cliArgs] },
  ];
}

async function synthesizeViaVpsBridge(
  text: string,
  language: string
): Promise<{ audioBase64: string; mimeType: "audio/mpeg" } | null> {
  const baseUrl = (
    process.env.VPS_EDGE_TTS_URL ||
    "https://father-connectors-insider-event.trycloudflare.com"
  )
    .trim()
    .replace(/\/+$/, "");
  const secret = (process.env.TTS_BRIDGE_SECRET || "hmnt_tts_2026").trim();
  if (!baseUrl) return null;
  try {
    const u = new URL(baseUrl + "/tts");
    u.searchParams.set("key", secret);
    u.searchParams.set("lang", language || "en-IN");
    u.searchParams.set("text", text.slice(0, 600));
    const res = await fetch(u.toString(), {
      method: "GET",
      signal: AbortSignal.timeout(12000),
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
  const bridged = await synthesizeViaVpsBridge(text, language);
  if (bridged && bridged.audioBase64) {
    const voice = language.toLowerCase().startsWith("hi")
      ? "hi-IN-SwaraNeural"
      : language.toLowerCase().startsWith("gu")
      ? "gu-IN-DhwaniNeural"
      : "en-IN-NeerjaNeural";
    return {
      audioBase64: bridged.audioBase64,
      mimeType: "audio/mpeg",
      voice,
      provider: "edge-tts",
    };
  }

  const voice = VOICE_PROFILES[language].voice;
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
  const file = join(tmpdir(), `edge-tts-${randomUUID()}.mp3`);
  const candidates = buildCandidates(deps.command ?? process.env.EDGE_TTS_BIN, voice, clean, file);

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
