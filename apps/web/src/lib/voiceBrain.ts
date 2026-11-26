import {
  KNOWLEDGE_LANGUAGES,
  normalizeLanguage,
  type KnowledgeLanguage,
} from "./knowledgeBase";

export type VoiceLanguage = KnowledgeLanguage;
export type VoiceGender = "female" | "male";

export const VOICE_LANGUAGES = KNOWLEDGE_LANGUAGES;

export const VOICE_PROFILES: Record<
  VoiceLanguage,
  {
    voice: string;
    femaleVoice: string;
    maleVoice: string;
    label: string;
    greeting: string;
    prompt: string;
  }
> = {
  "hi-IN": {
    voice: "hi-IN-SwaraNeural",
    femaleVoice: "hi-IN-SwaraNeural",
    maleVoice: "hi-IN-MadhurNeural",
    label: "Hindi",
    greeting: "नमस्ते",
    prompt: "कृपया अब बोलें, या कॉल समाप्त करने के लिए 9 दबाएँ।",
  },
  "gu-IN": {
    voice: "gu-IN-DhwaniNeural",
    femaleVoice: "gu-IN-DhwaniNeural",
    maleVoice: "gu-IN-NiranjanNeural",
    label: "Gujarati",
    greeting: "નમસ્તે",
    prompt: "કૃપા કરીને હવે બોલો, અથવા કૉલ સમાપ્ત કરવા 9 દબાવો.",
  },
  "en-IN": {
    voice: "en-IN-NeerjaNeural",
    femaleVoice: "en-IN-NeerjaNeural",
    maleVoice: "en-IN-PrabhatNeural",
    label: "English (India)",
    greeting: "Hello",
    prompt: "Please speak now, or press 9 to end the call.",
  },
};

export function normalizeVoiceLanguage(value: unknown): VoiceLanguage {
  return normalizeLanguage(value);
}

export function normalizeVoiceGender(value: unknown): VoiceGender {
  return value === "male" ? "male" : "female";
}

export function resolveVoice(language: VoiceLanguage, gender: unknown = "female"): string {
  const profile = VOICE_PROFILES[language];
  return normalizeVoiceGender(gender) === "male" ? profile.maleVoice : profile.femaleVoice;
}

export function detectVoiceLanguage(
  message: unknown,
  fallback: VoiceLanguage,
  enabled = true
): VoiceLanguage {
  const text = asText(message, MAX_MESSAGE_CHARS).toLowerCase();
  if (!enabled || !text) {
    return fallback;
  }
  if (GUJARATI_SCRIPT.test(text)) {
    return "gu-IN";
  }
  if (DEVANAGARI_SCRIPT.test(text)) {
    return "hi-IN";
  }

  const hindiScore = countPatternMatches(text, LATIN_HINDI_SIGNALS);
  const gujaratiScore = countPatternMatches(text, LATIN_GUJARATI_SIGNALS);
  if (hindiScore === 0 && gujaratiScore === 0) {
    return fallback;
  }
  if (hindiScore > gujaratiScore) {
    return "hi-IN";
  }
  if (gujaratiScore > hindiScore) {
    return "gu-IN";
  }
  return fallback;
}

export type VoiceKnowledgeBase = {
  business_name?: string | null;
  language?: string | null;
  business_profile?: unknown;
  faqs?: unknown;
  opening_script?: string | null;
  closing_script?: string | null;
  call_goal?: string | null;
};

export type VoiceTurn = {
  role: "customer" | "assistant";
  content: string;
};

export type VoiceResponseInput = {
  message: string;
  language: VoiceLanguage;
  knowledgeBase?: VoiceKnowledgeBase | null;
  leadName?: string;
  history?: VoiceTurn[];
};

export type VoiceResponseResult = {
  reply: string;
  provider: "groq" | "fallback";
  grounded: boolean;
  warnings: string[];
};

type FetchLike = typeof fetch;

type VoiceDependencies = {
  fetchImpl?: FetchLike;
  groqKey?: string;
};

type VoiceIntent = "greeting" | "pricing" | "location" | "services" | "callback" | "general";

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_FAST_MODEL = "qwen/qwen3.8-27b";
const GROQ_PREMIUM_MODEL = "qwen/qwen3.8-27b";
const GROQ_TIMEOUT_MS = 1500;
const GROQ_MAX_TOKENS = 150;
const MAX_REPLY_CHARS = 380;
const MAX_MESSAGE_CHARS = 1000;
const MAX_HISTORY_TURNS = 6;

function resolveGroqModel(): string {
  const configured = (process.env.GROQ_VOICE_MODEL ?? "").trim();
  return configured === GROQ_PREMIUM_MODEL ? GROQ_PREMIUM_MODEL : GROQ_FAST_MODEL;
}

const PRICING_SIGNALS = [
  "price",
  "pricing",
  "cost",
  "fee",
  "fees",
  "rate",
  "charges",
  "kitna",
  "kitne",
  "कीमत",
  "दाम",
  "किराया",
  "કિંમત",
  "ભાવ",
];

const LOCATION_SIGNALS = [
  "location",
  "address",
  "where",
  "directions",
  "kahan",
  "कहाँ",
  "पता",
  "ક્યાં",
  "સરનામું",
  "સ્થાન",
];

const SERVICE_SIGNALS = [
  "service",
  "services",
  "offer",
  "offers",
  "product",
  "products",
  "treatment",
  "package",
  "सेवा",
  "સેવા",
];

const CALLBACK_SIGNALS = [
  "callback",
  "call back",
  "call me",
  "contact me",
  "follow up",
  "संपर्क",
  "कॉल",
  "સંપર્ક",
  "કૉલ",
];

const GREETING_SIGNALS = [
  "hello",
  "hi",
  "hey",
  "namaste",
  "namaskar",
  "नमस्ते",
  "નમસ્તે",
];

const DEVANAGARI_SCRIPT = /[\u0900-\u097F]/;
const GUJARATI_SCRIPT = /[\u0A80-\u0AFF]/;

const LATIN_HINDI_SIGNALS = [
  /\bnamaste\b/g,
  /\bnamaskar\b/g,
  /\baap\b/g,
  /\bapka\b/g,
  /\baapka\b/g,
  /\bkya\b/g,
  /\bkitna\b/g,
  /\bkitne\b/g,
  /\bkahan\b/g,
  /\bkaise\b/g,
  /\bbataiye\b/g,
  /\bbatao\b/g,
  /\bchahiye\b/g,
  /\bchahte\b/g,
  /\bshukriya\b/g,
  /\bdhanyavaad\b/g,
  /\btheek\b/g,
  /\bjana\b/g,
  /\bjaana\b/g,
];

const LATIN_GUJARATI_SIGNALS = [
  /\bkem\s+cho\b/g,
  /\bkem\b/g,
  /\btame\b/g,
  /\btamne\b/g,
  /\bshun\b/g,
  /\bchhe\b/g,
  /\baavjo\b/g,
  /\bdhanhvaad\b/g,
  /\bbahu\b/g,
  /\bkaru\b/g,
  /\bkarish\b/g,
];

function countPatternMatches(text: string, patterns: RegExp[]): number {
  let total = 0;
  for (const pattern of patterns) {
    total += (text.match(pattern) ?? []).length;
  }
  return total;
}

function asText(value: unknown, maxLength = 600): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function asStringArray(value: unknown, maxItems = 8, maxLength = 160): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => asText(item, maxLength))
    .filter((item) => item.length > 0)
    .slice(0, maxItems);
}

function readProfile(value: unknown): {
  industry: string;
  summary: string;
  services: string[];
  locations: string[];
  contact: string[];
  hours: string[];
  highlights: string[];
} {
  const record = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    industry: asText(record.industry, 120),
    summary: asText(record.summary, 900),
    services: asStringArray(record.services),
    locations: asStringArray(record.locations),
    contact: asStringArray(record.contact),
    hours: asStringArray(record.hours),
    highlights: asStringArray(record.highlights),
  };
}

function readFaqs(value: unknown): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) {
    return [];
  }
  const faqs: Array<{ question: string; answer: string }> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const question = asText(record.question, 240);
    const answer = asText(record.answer, 700);
    if (question && answer) {
      faqs.push({ question, answer });
    }
    if (faqs.length >= 8) {
      break;
    }
  }
  return faqs;
}

export function sanitizeVoiceHistory(value: unknown): VoiceTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const turns: VoiceTurn[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const role = record.role === "assistant" ? "assistant" : record.role === "customer" ? "customer" : null;
    const content = asText(record.content, 600);
    if (role && content) {
      turns.push({ role, content });
    }
  }
  return turns.slice(-MAX_HISTORY_TURNS);
}

function detectIntent(message: string): VoiceIntent {
  const haystack = message.toLowerCase();
  if (PRICING_SIGNALS.some((signal) => haystack.includes(signal))) return "pricing";
  if (LOCATION_SIGNALS.some((signal) => haystack.includes(signal))) return "location";
  if (SERVICE_SIGNALS.some((signal) => haystack.includes(signal))) return "services";
  if (CALLBACK_SIGNALS.some((signal) => haystack.includes(signal))) return "callback";
  if (GREETING_SIGNALS.some((signal) => haystack.includes(signal))) return "greeting";
  return "general";
}

function businessNameOf(knowledgeBase?: VoiceKnowledgeBase | null): string {
  return asText(knowledgeBase?.business_name, 160) || "our team";
}

function joinForSpeech(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? "";
  }
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function buildFallbackReply(input: VoiceResponseInput): string {
  const language = input.language;
  const name = businessNameOf(input.knowledgeBase);
  const profile = readProfile(input.knowledgeBase?.business_profile);
  const leadName = asText(input.leadName, 80);
  const intent = detectIntent(input.message);
  const greeting = VOICE_PROFILES[language].greeting;

  if (language === "hi-IN") {
    if (intent === "greeting") {
      return `${greeting}${leadName ? ` ${leadName}` : ""}, मैं ${name} की AI सहायक हूँ। मैं आपकी कैसे मदद कर सकती हूँ?`;
    }
    if (intent === "pricing") {
      return "कीमत और उपलब्धता समय-समय पर बदलती है, इसलिए हमारी टीम आपको नवीनतम जानकारी की पुष्टि करेगी। क्या आप कॉलबैक चाहेंगे?";
    }
    if (intent === "location") {
      return profile.locations.length > 0
        ? `${name} ${joinForSpeech(profile.locations)} में स्थित है। क्या आप दिशा-निर्देश या कॉलबैक चाहेंगे?`
        : `हमारी टीम आपको ${name} का सटीक पता और दिशा-निर्देश साझा करेगी। क्या आप कॉलबैक चाहेंगे?`;
    }
    if (intent === "services") {
      return profile.services.length > 0
        ? `${name} ${joinForSpeech(profile.services)} जैसी सेवाएँ प्रदान करता है। हमारी टीम उपलब्धता और अगले कदम की पुष्टि करेगी।`
        : `हमारी टीम आपको ${name} की सेवाओं और अगले कदम की जानकारी देगी।`;
    }
    return `${name} से संपर्क करने के लिए धन्यवाद। हमारी टीम उपलब्धता और अगले कदम की पुष्टि करेगी। क्या आप कॉलबैक चाहेंगे?`;
  }

  if (language === "gu-IN") {
    if (intent === "greeting") {
      return `${greeting}${leadName ? ` ${leadName}` : ""}, હું ${name} ની AI સહાયક છું. હું તમને કેવી રીતે મદદ કરી શકું?`;
    }
    if (intent === "pricing") {
      return "કિંમત અને ઉપલબ્ધતા સમય સાથે બદલાય છે, તેથી અમારી ટીમ તમને નવીનતમ માહિતીની પુષ્ટિ કરશે. શું તમે કૉલબેક ઇચ્છો છો?";
    }
    if (intent === "location") {
      return profile.locations.length > 0
        ? `${name} ${joinForSpeech(profile.locations)} ખાતે સ્થિત છે. શું તમે દિશા-નિર્દેશ અથવા કૉલબેક ઇચ્છો છો?`
        : `અમારી ટીમ તમને ${name} નું ચોક્કસ સ્થાન અને દિશા-નિર્દેશ આપશે. શું તમે કૉલબેક ઇચ્છો છો?`;
    }
    if (intent === "services") {
      return profile.services.length > 0
        ? `${name} ${joinForSpeech(profile.services)} જેવી સેવાઓ આપે છે. અમારી ટીમ ઉપલબ્ધતા અને આગળના પગલાંની પુષ્ટિ કરશે.`
        : `અમારી ટીમ તમને ${name} ની સેવાઓ અને આગળના પગલાંની માહિતી આપશે.`;
    }
    return `${name} નો સંપર્ક કરવા બદલ આભાર. અમારી ટીમ ઉપલબ્ધતા અને આગળના પગલાંની પુષ્ટિ કરશે. શું તમે કૉલબેક ઇચ્છો છો?`;
  }

  if (intent === "greeting") {
    return `Namaste! Main Hemant bol raha hoon, ek software developer. Hum businesses ke liye modern website aur AI calling system banate hain jisse aapka business tezi se grow ho. Kya abhi 1 minute baat ho sakti hai?`;
  }
  if (intent === "pricing") {
    return "Pricing and availability change often, so our team will confirm the latest details with you. Would you like a callback?";
  }
  if (intent === "location") {
    return profile.locations.length > 0
      ? `${name} is located at ${joinForSpeech(profile.locations)}. Would you like directions or a callback?`
      : `Our team can share the exact location and directions for ${name}. Would you like a callback?`;
  }
  if (intent === "services") {
    return profile.services.length > 0
      ? `${name} offers ${joinForSpeech(profile.services)}. Our team can confirm availability and next steps.`
      : `Our team can share the latest details about ${name}'s offerings and next steps.`;
  }
  return `Thanks for reaching out to ${name}. Our team will confirm availability and next steps. Would you like a callback?`;
}

function resolveGroqKey(explicit?: string): string {
  const value = (explicit ?? process.env.GROQ_API_KEY ?? process.env.GROQ_KEY ?? "").trim();
  if (!value || /^(REPLACE_ME|YOUR_|CHANGE_ME|PLACEHOLDER|<)/i.test(value)) {
    return "";
  }
  return value;
}

function sanitizeReply(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_#>`]/g, " ")
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REPLY_CHARS);
}

function buildKnowledgeContext(knowledgeBase?: VoiceKnowledgeBase | null): string {
  if (!knowledgeBase) {
    return "(no knowledge base has been trained yet)";
  }
  const profile = readProfile(knowledgeBase.business_profile);
  const faqs = readFaqs(knowledgeBase.faqs);
  return [
    `Business name: ${businessNameOf(knowledgeBase)}`,
    `Industry: ${profile.industry || "(unknown)"}`,
    `Summary: ${profile.summary || "(none)"}`,
    `Services: ${profile.services.join(", ") || "(none)"}`,
    `Locations: ${profile.locations.join(", ") || "(none)"}`,
    `Contact: ${profile.contact.join(", ") || "(none)"}`,
    `Hours: ${profile.hours.join(", ") || "(none)"}`,
    `Highlights: ${profile.highlights.join(", ") || "(none)"}`,
    `Call goal: ${asText(knowledgeBase.call_goal, 300) || "(none)"}`,
    `Opening script: ${asText(knowledgeBase.opening_script, 500) || "(none)"}`,
    `Closing script: ${asText(knowledgeBase.closing_script, 300) || "(none)"}`,
    faqs.length > 0
      ? `FAQs: ${faqs.map((faq) => `Q: ${faq.question} A: ${faq.answer}`).join(" | ")}`
      : "FAQs: (none)",
  ].join("\n");
}

type GroqPayload = {
  choices?: Array<{ message?: { content?: string } }>;
};

async function callGroq(
  input: VoiceResponseInput,
  deps: VoiceDependencies
): Promise<string | null> {
  const apiKey = resolveGroqKey(deps.groqKey);
  if (!apiKey) {
    return null;
  }

  const language = VOICE_PROFILES[input.language];
  const system = [
    "You are a multilingual AI phone agent for a business.",
    "Always answer in the requested language only.",
    "Use ONLY the supplied business knowledge base.",
    "Never invent prices, availability, appointments, guarantees, or contact details.",
    "If a fact is missing, say the team will confirm the details instead of guessing.",
    "Reply with 1-2 very short conversational sentences suitable for speech, under 45 words.",
    "Do not use markdown, emojis, bullet points, or stage directions.",
  ].join(" ");

  const history = (input.history ?? [])
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => `${turn.role === "assistant" ? "Agent" : "Customer"}: ${turn.content}`)
    .join("\n");

  const user = [
    `Requested language: ${language.label} (${input.language})`,
    `Lead name: ${asText(input.leadName, 80) || "(unknown)"}`,
    "Business knowledge base:",
    buildKnowledgeContext(input.knowledgeBase),
    history ? `Conversation so far:\n${history}` : "Conversation so far: (none)",
    `Customer's latest message: ${input.message}`,
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
        model: resolveGroqModel(),
        temperature: 0.2,
        max_tokens: GROQ_MAX_TOKENS,
        reasoning_effort: "low",
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
    const reply = sanitizeReply(content);
    return reply || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateVoiceResponse(
  input: VoiceResponseInput,
  deps: VoiceDependencies = {}
): Promise<VoiceResponseResult> {
  const message = asText(input.message, MAX_MESSAGE_CHARS);
  const warnings: string[] = [];
  const grounded = Boolean(input.knowledgeBase);

  if (!grounded) {
    warnings.push("No trained knowledge base found; using a safe generic response.");
  }

  const safeInput: VoiceResponseInput = {
    ...input,
    message,
    history: sanitizeVoiceHistory(input.history),
  };

  const groqReply = await callGroq(safeInput, deps);
  if (groqReply) {
    return { reply: groqReply, provider: "groq", grounded, warnings };
  }

  warnings.push(
    resolveGroqKey(deps.groqKey)
      ? "Groq response failed; used the deterministic fallback responder."
      : "Groq is not configured; used the deterministic fallback responder."
  );

  return {
    reply: buildFallbackReply(safeInput),
    provider: "fallback",
    grounded,
    warnings,
  };
}
