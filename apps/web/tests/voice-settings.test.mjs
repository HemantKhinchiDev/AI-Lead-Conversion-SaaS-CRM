import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, "..");

function read(relativePath) {
  return readFileSync(join(webRoot, relativePath), "utf8");
}

test("voice settings defaults and per-target overrides persist in localStorage", () => {
  const lib = read("src/lib/voiceSettings.ts");
  for (const field of [
    "opening_script: string",
    "voice_gender: VoiceGender",
    "starting_language: StartingLanguage",
    "auto_language_switch: boolean",
  ]) {
    assert.ok(lib.includes(field), `missing settings field: ${field}`);
  }
  assert.ok(lib.includes('VOICE_SETTINGS_STORAGE_KEY = "voice-call-settings"'));
  assert.ok(lib.includes('voice_gender: "female"'));
  assert.ok(lib.includes('starting_language: "en-IN"'));
  assert.ok(lib.includes("auto_language_switch: true"));
  assert.ok(lib.includes('VOICE_GENDERS = ["female", "male"]'));
  assert.ok(lib.includes('STARTING_LANGUAGES = ["hi-IN", "en-IN", "gu-IN"]'));
  for (const helper of [
    "normalizeOpeningScript",
    "normalizeVoiceGender",
    "normalizeStartingLanguage",
    "normalizeAutoLanguageSwitch",
    "getVoiceSettings",
    "saveVoiceSettings",
    "leadVoiceSettingsKey",
    "campaignVoiceSettingsKey",
  ]) {
    assert.ok(lib.includes(`function ${helper}`), `missing helper: ${helper}`);
  }
  assert.ok(lib.includes('typeof window === "undefined"'));
  assert.ok(lib.includes("window.localStorage.setItem"));
  assert.ok(lib.includes("window.localStorage.getItem"));
});

test("voice settings panel exposes script, gender, language and auto-switch controls", () => {
  const panel = read("src/components/VoiceSettingsPanel.tsx");
  for (const label of [
    "Opening Pitch Script",
    "Voice Gender",
    "Starting Language",
    "Auto-switch language after detecting user&apos;s spoken language",
    "Apply settings to",
  ]) {
    assert.ok(panel.includes(label), `missing control: ${label}`);
  }
  for (const testId of [
    "voice-settings-target",
    "voice-settings-opening-script",
    "voice-settings-voice-gender",
    "voice-settings-starting-language",
    "voice-settings-auto-switch",
  ]) {
    assert.ok(panel.includes(`data-testid="${testId}"`), `missing test id: ${testId}`);
  }
  assert.ok(panel.includes('patch({ voice_gender: event.target.value as VoiceGender })'));
  assert.ok(panel.includes('patch({ auto_language_switch: event.target.checked })'));
  assert.ok(panel.includes("<option value=\"female\">Female</option>"));
  assert.ok(panel.includes("<option value=\"male\">Male</option>"));
  assert.ok(panel.includes("export function useVoiceSettings"));
  assert.ok(panel.includes("saveVoiceSettings(targetKey, next)"));
});

test("dashboard client edits voice settings per lead or campaign", () => {
  const dashboard = read("src/app/dashboard/DashboardClient.tsx");
  assert.ok(dashboard.includes('id="voice-settings"'));
  assert.ok(dashboard.includes("VoiceSettingsPanel"));
  assert.ok(dashboard.includes("useVoiceSettings(voiceTargetKey)"));
  assert.ok(dashboard.includes("leadVoiceSettingsKey(lead.id)"));
  assert.ok(dashboard.includes("campaignVoiceSettingsKey(campaign.id)"));
  assert.ok(dashboard.includes("Default · all calls"));
});

test("voice demo sends settings with every /api/voice/respond request", () => {
  const modal = read("src/components/VoiceDemoModal.tsx");
  assert.ok(modal.includes('fetch("/api/voice/respond"'));
  assert.ok(modal.includes("generate_audio: true"));
  for (const field of [
    "opening_script: settings.opening_script",
    "voice_gender: settings.voice_gender",
    "starting_language: settings.starting_language",
    "auto_language_switch: settings.auto_language_switch",
  ]) {
    assert.ok(modal.includes(field), `missing demo payload field: ${field}`);
  }
  assert.ok(modal.includes("VoiceSettingsPanel"));
  assert.ok(modal.includes("useVoiceSettings()"));
  assert.ok(modal.includes("handleSettingsChange"));
});

test("live dashboard sends per-lead settings with every /api/voice/trigger request", () => {
  const page = read("src/app/dashboard/page.tsx");
  assert.ok(page.includes('fetch("/api/voice/trigger"'));
  assert.ok(page.includes("getVoiceSettings(leadVoiceSettingsKey(lead.id))"));
  for (const field of [
    "opening_script: voiceSettingsForLead.opening_script",
    "voice_gender: voiceSettingsForLead.voice_gender",
    "starting_language: voiceSettingsForLead.starting_language",
    "auto_language_switch: voiceSettingsForLead.auto_language_switch",
  ]) {
    assert.ok(page.includes(field), `missing trigger payload field: ${field}`);
  }
  assert.ok(page.includes('data-testid="voice-call-settings"'));
  assert.ok(page.includes("VoiceSettingsPanel"));
});

test("voice routes validate and acknowledge client voice settings without trusting tenant", () => {
  const trigger = read("src/app/api/voice/trigger/route.ts");
  for (const field of [
    "normalizeOpeningScript(body?.opening_script)",
    "normalizeVoiceGender(body?.voice_gender)",
    "normalizeStartingLanguage(body?.starting_language)",
    "normalizeAutoLanguageSwitch(body?.auto_language_switch)",
    "voice_settings",
  ]) {
    assert.ok(trigger.includes(field), `missing trigger field: ${field}`);
  }
  assert.ok(trigger.includes("evaluateVoiceEligibility(lead, tenantId)"));
  assert.doesNotMatch(trigger, /body\?\.tenant_id|body\.tenant_id/);

  const respond = read("src/app/api/voice/respond/route.ts");
  for (const field of [
    "normalizeOpeningScript(body.opening_script)",
    "normalizeVoiceGender(body.voice_gender)",
    "normalizeStartingLanguage(body.starting_language)",
    "normalizeAutoLanguageSwitch(body.auto_language_switch)",
    "voice_settings: voiceSettings",
  ]) {
    assert.ok(respond.includes(field), `missing respond field: ${field}`);
  }
  assert.doesNotMatch(respond, /body\?\.tenant_id|body\.tenant_id/);
});

test("voice settings files contain no hardcoded provider secrets", () => {
  const combined = [
    "src/lib/voiceSettings.ts",
    "src/components/VoiceSettingsPanel.tsx",
    "src/components/VoiceDemoModal.tsx",
    "src/app/dashboard/DashboardClient.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/api/voice/trigger/route.ts",
    "src/app/api/voice/respond/route.ts",
  ]
    .map((path) => read(path))
    .join("\n");
  assert.doesNotMatch(combined, /gsk_[A-Za-z0-9]{20,}/);
  assert.doesNotMatch(combined, /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'][^"']+/);
  assert.doesNotMatch(combined, /MA[0-9a-f]{20,}/);
});
