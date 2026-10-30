const PERFORMANCE_MODES = new Set(["auto", "natural", "soft", "close", "breathy", "expressive"]);
const LANGUAGE_CODES = new Set(["auto", "zh", "ja", "en", "ko"]);

const PERFORMANCE_DIRECTIONS = {
  soft: "soft-spoken, warm, unhurried",
  close: "low, close-mic, quiet, unhurried",
  breathy: "low, close-mic, restrained, breath-led",
  expressive: "warm, emotionally expressive, natural",
};

const LEGACY_STYLE_TAGS = {
  soft: "[whispers]",
  teasing: "[mischievously]",
  excited: "[excited]",
  tired: "[sighs]",
  laughing: "[laughs]",
  curious: "[curious]",
};

const BREATH_PATTERNS = {
  breathy: [
    { id: "exhale", tag: "[exhales]" },
    { id: "sigh", tag: "[sighs]" },
    { id: "none", tag: "" },
  ],
  expressive: [
    { id: "sigh", tag: "[sighs]" },
    { id: "exhale", tag: "[exhales]" },
    { id: "none", tag: "" },
  ],
};

const MODE_STABILITY_DEFAULTS = {
  soft: 0.48,
  close: 0.46,
  breathy: 0.42,
  expressive: 0.4,
};

export function stripAudioTags(text) {
  return String(text ?? "")
    .replace(/\[[A-Za-z][^\]\r\n]{0,179}\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function normalizeDirection(value) {
  if (value === undefined || value === null) return undefined;

  const direction = String(value)
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/[\[\]\r\n]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!direction) return undefined;
  if (direction.length > 180) {
    throw new Error("direction is too long (max 180 characters)");
  }

  return direction;
}

export function normalizePerformance(value) {
  const mode = String(value ?? "auto").trim().toLowerCase() || "auto";
  if (!PERFORMANCE_MODES.has(mode)) {
    throw new Error(`Unknown performance mode: ${mode}`);
  }
  return mode;
}

export function normalizeLanguage(value) {
  const language = String(value ?? "auto").trim().toLowerCase() || "auto";
  if (!LANGUAGE_CODES.has(language)) {
    throw new Error(`Unsupported language override: ${language}`);
  }
  return language;
}

export function speakableCharCount(text) {
  return stripAudioTags(String(text ?? ""))
    .replace(/[\s\p{P}\p{S}]/gu, "")
    .length;
}

function directionWordCount(value) {
  return (String(value ?? "").match(/[A-Za-z0-9'-]+/g) || []).length;
}

function trimDirectionForText(direction, text) {
  const normalized = normalizeDirection(direction);
  if (!normalized) return undefined;

  const chars = speakableCharCount(text);
  if (chars < 6) return undefined;

  const maxWords = chars < 12 ? 2 : chars < 24 ? 4 : 8;
  const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
  const totalWords = () => parts.reduce((sum, part) => sum + directionWordCount(part), 0);

  while (parts.length > 1 && totalWords() > maxWords) {
    parts.pop();
  }

  if (totalWords() > maxWords && parts.length === 1) {
    parts[0] = parts[0].split(/\s+/).slice(0, maxWords).join(" ");
  }

  return parts.join(", ") || undefined;
}

function findNaturalPause(text) {
  const source = String(text ?? "");
  const boundary = /(……|…{1,}|[，,、;；。！？!?])/g;
  const candidates = [];
  let match;

  while ((match = boundary.exec(source)) !== null) {
    const at = match.index + match[0].length;
    const ratio = at / Math.max(1, source.length);
    if (ratio >= 0.25 && ratio <= 0.76) {
      candidates.push({ at, distance: Math.abs(ratio - 0.52) });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance);
  return candidates[0]?.at;
}

function chooseBreathPattern(mode, text, history) {
  if (speakableCharCount(text) < 18) return null;
  if (findNaturalPause(text) === undefined) return null;

  const options = BREATH_PATTERNS[mode];
  if (!options) return null;

  const recent = new Set(history.slice(-2));
  const fresh = options.filter((item) => !recent.has(item.id));
  const pool = fresh.length ? fresh : options;

  let hash = 0;
  for (const ch of stripAudioTags(text)) {
    hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  }
  const picked = pool[hash % pool.length];

  history.push(picked.id);
  if (history.length > 6) history.shift();
  return picked;
}

function insertAtNaturalPause(text, tag) {
  if (!tag) return String(text ?? "").trim();
  const source = String(text ?? "").trim();
  const at = findNaturalPause(source);
  if (at === undefined) return source;
  return `${source.slice(0, at)} ${tag} ${source.slice(at).trimStart()}`;
}

export function createPerformancePlan(text, options = {}) {
  const {
    performance,
    direction,
    style,
    rawTags,
    recentPatterns = [],
  } = options;

  const requestedMode = normalizePerformance(performance);
  const mode = requestedMode === "auto" ? "natural" : requestedMode;
  const preserveInlineTags = rawTags === true;
  const baseText = preserveInlineTags ? String(text ?? "").trim() : stripAudioTags(text);

  const explicitDirection = normalizeDirection(direction);
  const legacyTag = !explicitDirection && (!performance || requestedMode === "auto") && style
    ? LEGACY_STYLE_TAGS[String(style).trim().toLowerCase()]
    : undefined;

  let selectedDirection = explicitDirection;
  if (!selectedDirection && !legacyTag && mode !== "natural") {
    selectedDirection = PERFORMANCE_DIRECTIONS[mode];
  }

  const safeDirection = trimDirectionForText(selectedDirection, baseText);
  const breathPattern = !preserveInlineTags && (mode === "breathy" || mode === "expressive")
    ? chooseBreathPattern(mode, baseText, recentPatterns)
    : null;

  return {
    requested_mode: requestedMode,
    mode,
    direction: safeDirection,
    legacy_tag: legacyTag,
    breath_event: breathPattern?.id || null,
    rendered_text: breathPattern
      ? insertAtNaturalPause(baseText, breathPattern.tag)
      : baseText,
    raw_tags_preserved: preserveInlineTags,
  };
}

export function detectLanguage(text, requested = "auto") {
  const override = normalizeLanguage(requested);
  if (override !== "auto") return override;

  const clean = stripAudioTags(text);
  if (/[\u3040-\u30ff]/u.test(clean)) return "ja";
  if (/[\uac00-\ud7af]/u.test(clean)) return "ko";
  if (/[\u3400-\u9fff\uf900-\ufaff]/u.test(clean)) return "zh";
  if (/[A-Za-z]/u.test(clean)) return "en";
  return undefined;
}

export function getVoiceIdForLanguage(text, requestedLanguage = "auto", env = process.env) {
  const language = detectLanguage(text, requestedLanguage);
  const languageVoice = {
    zh: env.ELEVENLABS_VOICE_ID_ZH,
    ja: env.ELEVENLABS_VOICE_ID_JA,
    en: env.ELEVENLABS_VOICE_ID_EN,
    ko: env.ELEVENLABS_VOICE_ID_KO,
  };

  return {
    language,
    voiceId: languageVoice[language] || env.ELEVENLABS_VOICE_ID,
  };
}

function readBoundedNumber(value, name, min, max) {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return parsed;
}

export function buildVoiceSettings(mode, modelId, env = process.env) {
  const settings = {};
  const normalizedMode = normalizePerformance(mode);
  const modeKey = normalizedMode.toUpperCase();

  const modeStability = readBoundedNumber(
    env[`ELEVENLABS_STABILITY_${modeKey}`],
    `ELEVENLABS_STABILITY_${modeKey}`,
    0,
    1,
  );
  const globalStability = readBoundedNumber(env.ELEVENLABS_STABILITY, "ELEVENLABS_STABILITY", 0, 1);
  const defaultModeStability = MODE_STABILITY_DEFAULTS[normalizedMode];
  const stability = modeStability ?? globalStability ?? defaultModeStability;

  if (stability !== undefined) settings.stability = stability;

  const similarity = readBoundedNumber(
    env.ELEVENLABS_SIMILARITY_BOOST,
    "ELEVENLABS_SIMILARITY_BOOST",
    0,
    1,
  );
  if (similarity !== undefined) settings.similarity_boost = similarity;

  if (modelId === "eleven_v4" || modelId === "eleven_v4_turbo") {
    const cloneStrength = readBoundedNumber(
      env.ELEVENLABS_CLONE_STRENGTH,
      "ELEVENLABS_CLONE_STRENGTH",
      0,
      1,
    );
    if (cloneStrength !== undefined) settings.clone_strength = cloneStrength;
    return settings;
  }

  if (modelId !== "eleven_v3" && modelId !== "eleven_v3_conversational") {
    if (env.ELEVENLABS_USE_SPEAKER_BOOST !== undefined) {
      settings.use_speaker_boost = String(env.ELEVENLABS_USE_SPEAKER_BOOST).toLowerCase() === "true";
    }

    const style = readBoundedNumber(env.ELEVENLABS_STYLE, "ELEVENLABS_STYLE", 0, 1);
    const speed = readBoundedNumber(env.ELEVENLABS_SPEED, "ELEVENLABS_SPEED", 0.7, 1.2);
    if (style !== undefined) settings.style = style;
    if (speed !== undefined) settings.speed = speed;
  }

  return settings;
}

export function shouldApplyJapaneseNormalization(language, env = process.env) {
  return language === "ja"
    && String(env.ELEVENLABS_JA_TEXT_NORMALIZATION ?? "false").toLowerCase() === "true";
}
