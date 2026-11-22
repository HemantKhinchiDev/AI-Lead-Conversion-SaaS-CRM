# PRD v2.2: Autonomous Multi-Industry AI Voice & Lead Conversion SaaS

## 1. Product Goal
A multi-tenant B2B SaaS where **any business** (clinics, coaching, real estate, gyms, dealerships, agencies) signs up, pastes their **Website URL, Google Maps link, Call Goal, and Custom Script**, and gets an AI voice agent that calls leads in **Hindi, Gujarati, or English**, extracts structured post-call outcomes (`INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`), and syncs 2-way with **Google Sheets**.

## 2. Autonomous Delivery Contract (For Hermes / OpenCode)
- Work strictly task-by-task from `specs/002-universal-voice-sheets/tasks.md`.
- Never mark a task `[x]` unless its `Verify:` command passes completely.
- Keep UI labels universal (multi-industry) rather than real-estate hardcoded.

## 3. Core Modules (Phase 2)
1. **Universal Knowledge Base (`/api/kb/train`):** Scrapes website URL + map context, uses Groq to generate structured business facts, FAQs, and opening/closing scripts saved in `public.knowledge_bases`.
2. **Multilingual Voice Brain & Dialer (`/api/voice/respond` + `edge-tts` + Plivo):** Generates 1–2 line grounded responses in Hindi/Gujarati/English + sub-second MP3 audio + in-browser Live Voice Test modal + Plivo outbound call bridge (falling back cleanly to simulated mode if Plivo credentials are not yet set).
3. **Post-Call Outcome Extractor (`/api/voice/analyze`):** Classifies every call into `call_outcome` (`INTERESTED`, `NOT_INTERESTED`, `CALLBACK_REQUESTED`, `NO_ANSWER`), parses `callback_datetime`, writes `ai_summary` & `full_transcript`, and displays them in the Dashboard table.
4. **2-Way Google Sheets Sync (`/api/sheets/*`):** Imports leads from a Google Sheet URL (`+91` normalized), auto-updates existing sheet rows (`Outcome`, `Callback Time`, `AI Summary`) after calls, and exports filtered leads to a new Google Sheet.
