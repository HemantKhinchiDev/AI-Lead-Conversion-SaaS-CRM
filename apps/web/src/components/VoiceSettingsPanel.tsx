"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_VOICE_SETTINGS,
  OPENING_SCRIPT_MAX_CHARS,
  STARTING_LANGUAGES,
  getVoiceSettings,
  saveVoiceSettings,
  type StartingLanguage,
  type VoiceGender,
  type VoiceSettings,
} from "../lib/voiceSettings";

export function useVoiceSettings(targetKey = ""): {
  settings: VoiceSettings;
  updateSettings: (next: VoiceSettings) => void;
} {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);

  useEffect(() => {
    setSettings(getVoiceSettings(targetKey));
  }, [targetKey]);

  const updateSettings = useCallback(
    (next: VoiceSettings) => {
      setSettings(saveVoiceSettings(targetKey, next));
    },
    [targetKey]
  );

  return { settings, updateSettings };
}

const LANGUAGE_LABELS: Record<StartingLanguage, string> = {
  "hi-IN": "Hindi",
  "en-IN": "English (India)",
  "gu-IN": "Gujarati",
};

type VoiceSettingsPanelProps = {
  settings: VoiceSettings;
  onChange: (settings: VoiceSettings) => void;
  idPrefix: string;
  targetKey?: string;
  targetOptions?: Array<{ value: string; label: string }>;
  onTargetChange?: (value: string) => void;
};

export default function VoiceSettingsPanel({
  settings,
  onChange,
  idPrefix,
  targetKey = "",
  targetOptions,
  onTargetChange,
}: VoiceSettingsPanelProps) {
  function patch(partial: Partial<VoiceSettings>) {
    onChange({ ...settings, ...partial });
  }

  return (
    <div className="voice-settings" data-testid="voice-settings">
      {targetOptions && onTargetChange && (
        <label className="dash-field" htmlFor={`${idPrefix}-target`}>
          <span>Apply settings to</span>
          <select
            id={`${idPrefix}-target`}
            className="dash-input"
            data-testid="voice-settings-target"
            value={targetKey}
            onChange={(event) => onTargetChange(event.target.value)}
          >
            {targetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="dash-field" htmlFor={`${idPrefix}-opening-script`}>
        <span>Opening Pitch Script</span>
        <textarea
          id={`${idPrefix}-opening-script`}
          className="dash-input"
          data-testid="voice-settings-opening-script"
          rows={3}
          maxLength={OPENING_SCRIPT_MAX_CHARS}
          value={settings.opening_script}
          onChange={(event) => patch({ opening_script: event.target.value })}
          placeholder="Namaste! Main aapki company ke liye AI agent hoon. Kya main aapko 1 minute mein project details samajh sakta hoon?"
        />
      </label>

      <div className="dash-grid">
        <label className="dash-field" htmlFor={`${idPrefix}-voice-gender`}>
          <span>Voice Gender</span>
          <select
            id={`${idPrefix}-voice-gender`}
            className="dash-input"
            data-testid="voice-settings-voice-gender"
            value={settings.voice_gender}
            onChange={(event) => patch({ voice_gender: event.target.value as VoiceGender })}
          >
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
        </label>

        <label className="dash-field" htmlFor={`${idPrefix}-starting-language`}>
          <span>Starting Language</span>
          <select
            id={`${idPrefix}-starting-language`}
            className="dash-input"
            data-testid="voice-settings-starting-language"
            value={settings.starting_language}
            onChange={(event) =>
              patch({ starting_language: event.target.value as StartingLanguage })
            }
          >
            {STARTING_LANGUAGES.map((language) => (
              <option key={language} value={language}>
                {LANGUAGE_LABELS[language]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="consent-label" htmlFor={`${idPrefix}-auto-switch`}>
        <input
          id={`${idPrefix}-auto-switch`}
          type="checkbox"
          data-testid="voice-settings-auto-switch"
          checked={settings.auto_language_switch}
          onChange={(event) => patch({ auto_language_switch: event.target.checked })}
        />
        <span>Auto-switch language after detecting user&apos;s spoken language</span>
      </label>
    </div>
  );
}
