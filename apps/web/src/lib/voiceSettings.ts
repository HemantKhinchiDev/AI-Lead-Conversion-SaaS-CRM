export const VOICE_GENDERS = ["female", "male"] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export const STARTING_LANGUAGES = ["hi-IN", "en-IN", "gu-IN"] as const;
export type StartingLanguage = (typeof STARTING_LANGUAGES)[number];

export const OPENING_SCRIPT_MAX_CHARS = 600;
export const VOICE_SETTINGS_STORAGE_KEY = "voice-call-settings";

export type VoiceSettings = {
  opening_script: string;
  voice_gender: VoiceGender;
  starting_language: StartingLanguage;
  auto_language_switch: boolean;
};

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  opening_script: "",
  voice_gender: "female",
  starting_language: "en-IN",
  auto_language_switch: true,
};

type VoiceSettingsStore = {
  defaults: VoiceSettings;
  targets: Record<string, VoiceSettings>;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function normalizeOpeningScript(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_VOICE_SETTINGS.opening_script;
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OPENING_SCRIPT_MAX_CHARS);
}

export function normalizeVoiceGender(value: unknown): VoiceGender {
  return typeof value === "string" && (VOICE_GENDERS as readonly string[]).includes(value)
    ? (value as VoiceGender)
    : DEFAULT_VOICE_SETTINGS.voice_gender;
}

export function normalizeStartingLanguage(value: unknown): StartingLanguage {
  return typeof value === "string" && (STARTING_LANGUAGES as readonly string[]).includes(value)
    ? (value as StartingLanguage)
    : DEFAULT_VOICE_SETTINGS.starting_language;
}

export function normalizeAutoLanguageSwitch(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    return ["true", "1", "yes", "on"].includes(value.trim().toLowerCase());
  }
  return DEFAULT_VOICE_SETTINGS.auto_language_switch;
}

export function sanitizeVoiceSettings(value: unknown): VoiceSettings {
  const raw = asRecord(value);
  if (!raw) return { ...DEFAULT_VOICE_SETTINGS };
  return {
    opening_script: normalizeOpeningScript(raw.opening_script),
    voice_gender: normalizeVoiceGender(raw.voice_gender),
    starting_language: normalizeStartingLanguage(raw.starting_language),
    auto_language_switch: normalizeAutoLanguageSwitch(raw.auto_language_switch),
  };
}

export function normalizeVoiceSettingsStore(value: unknown): VoiceSettingsStore {
  const raw = asRecord(value);
  const rawTargets = asRecord(raw?.targets);
  const targets: Record<string, VoiceSettings> = {};

  if (rawTargets) {
    for (const [key, entry] of Object.entries(rawTargets)) {
      if (key.length > 0 && key.length <= 128) {
        targets[key] = sanitizeVoiceSettings(entry);
      }
    }
  }

  return {
    defaults: sanitizeVoiceSettings(raw?.defaults ?? raw),
    targets,
  };
}

export function readVoiceSettingsStore(): VoiceSettingsStore {
  if (typeof window === "undefined") {
    return normalizeVoiceSettingsStore(null);
  }
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_STORAGE_KEY);
    if (!raw) return normalizeVoiceSettingsStore(null);
    return normalizeVoiceSettingsStore(JSON.parse(raw));
  } catch {
    return normalizeVoiceSettingsStore(null);
  }
}

export function writeVoiceSettingsStore(store: VoiceSettingsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      VOICE_SETTINGS_STORAGE_KEY,
      JSON.stringify(normalizeVoiceSettingsStore(store))
    );
  } catch {
    return;
  }
}

export function leadVoiceSettingsKey(leadId: string): string {
  return `lead:${leadId}`;
}

export function campaignVoiceSettingsKey(campaignId: string): string {
  return `campaign:${campaignId}`;
}

export function getVoiceSettings(targetKey = ""): VoiceSettings {
  const store = readVoiceSettingsStore();
  if (!targetKey) return store.defaults;
  return store.targets[targetKey] ?? store.defaults;
}

export function saveVoiceSettings(targetKey: string, settings: VoiceSettings): VoiceSettings {
  const store = readVoiceSettingsStore();
  const next = sanitizeVoiceSettings(settings);
  if (!targetKey) {
    store.defaults = next;
  } else {
    store.targets[targetKey] = next;
  }
  writeVoiceSettingsStore(store);
  return next;
}
