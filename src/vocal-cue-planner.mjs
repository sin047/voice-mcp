const CUE_DEFINITIONS = Object.freeze({
  soft_inhale: Object.freeze({ family: "breath", label_zh: "轻颤吸气", tag: "soft shuddering inhale" }),
  heavy_ragged_breathing: Object.freeze({ family: "breath", label_zh: "急促粗重喘息", tag: "heavy ragged breathing" }),
  ragged_exhale: Object.freeze({ family: "breath", label_zh: "粗重呼气", tag: "ragged exhale" }),
  warm_exhale: Object.freeze({ family: "breath", label_zh: "温热呼气", tag: "warm exhale" }),
  close_whisper: Object.freeze({ family: "voice", label_zh: "贴近耳边低语", tag: "intense close-up whisper against ear" }),
  husky_low_whisper: Object.freeze({ family: "voice", label_zh: "沙哑低声耳语", tag: "husky low whisper" }),
  breathless_husky_whisper: Object.freeze({ family: "voice", label_zh: "气息不稳的沙哑低语", tag: "breathless husky whisper" }),
  gentle_growl: Object.freeze({ family: "voice", label_zh: "轻柔喉音", tag: "gentle possessive growl" }),
  deep_wet_kiss: Object.freeze({ family: "mouth", label_zh: "深吻", tag: "deep, messy wet kiss" }),
  wet_licking: Object.freeze({ family: "mouth", label_zh: "湿润舔舐", tag: "deep, messy wet licking" }),
  wet_sucking: Object.freeze({ family: "mouth", label_zh: "湿润吮吸", tag: "wet sucking" }),
  wet_squelch: Object.freeze({ family: "mouth", label_zh: "湿润挤压声", tag: "wet squelch" }),
  sticky_parting: Object.freeze({ family: "mouth", label_zh: "湿黏分离声", tag: "sticky wet parting" }),
  swallowing_hard: Object.freeze({ family: "mouth", label_zh: "用力吞咽", tag: "swallowing hard" }),
  lower_lip_suck: Object.freeze({ family: "mouth", label_zh: "下唇轻吮", tag: "soft suck on the lower lip" }),
  neck_bite: Object.freeze({ family: "mouth", label_zh: "颈部轻咬", tag: "firm bite on the neck" }),
});

export const VOCAL_CUE_TYPES = Object.freeze(Object.keys(CUE_DEFINITIONS));

const TRAILING_PUNCTUATION = new Set([
  "，", "。", "！", "？", "、", "；", "：", ",", ".", "!", "?", ";", ":",
  "…", "⋯", "”", "’", "\"", "'", "）", ")", "】", "]", "》", "」", "』",
]);

function findOccurrence(text, anchor, occurrence) {
  let from = 0;
  let index = -1;
  for (let count = 0; count < occurrence; count += 1) {
    index = text.indexOf(anchor, from);
    if (index < 0) return -1;
    from = index + anchor.length;
  }
  return index;
}

function isBoundaryCharacter(value) {
  return value === undefined || value === "\n" || value === "\r" ||
    /\s/u.test(value) || TRAILING_PUNCTUATION.has(value) ||
    "（([{“‘".includes(value);
}

function resolveLineAfterPosition(text, anchorEnd) {
  let position = anchorEnd;
  let consumedPunctuation = false;
  while (position < text.length && TRAILING_PUNCTUATION.has(text[position])) {
    position += 1;
    consumedPunctuation = true;
  }

  const next = text[position];
  if (next !== undefined && next !== "\n" && next !== "\r" &&
      !/\s/u.test(next) && !consumedPunctuation) {
    throw new Error("A line-layout cue after an anchor needs a phrase boundary; use inline layout inside a phrase");
  }
  return position;
}

function renderInsertion(text, group, newline) {
  const tokens = group.tokens.join(" ");
  if (group.layout === "line") {
    const needsPrefixBreak = group.position > 0 && text[group.position - 1] !== "\n";
    const needsSuffixBreak = group.position < text.length &&
      text[group.position] !== "\n" && text[group.position] !== "\r";
    return (needsPrefixBreak ? newline : "") + tokens + (needsSuffixBreak ? newline : "");
  }

  const previous = group.position > 0 ? text[group.position - 1] : undefined;
  const next = group.position < text.length ? text[group.position] : undefined;
  const hasAdjacentWhitespace = (previous !== undefined && /\s/u.test(previous)) ||
    (next !== undefined && /\s/u.test(next));
  const separator = hasAdjacentWhitespace ? "" : " ";
  return group.placement === "before" ? tokens + separator : separator + tokens;
}

/**
 * Deterministic vocal-tag planner.
 * It never infers cues from keywords and never calls a speech provider.
 * The tags are reference-derived candidates; they still require listening validation.
 */
export function planVocalCues({ text, cues } = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 1200) {
    throw new Error("text must contain 1–1200 characters");
  }
  if (!Array.isArray(cues) || cues.length < 1 || cues.length > 16) {
    throw new Error("cues must contain between 1 and 16 explicit vocal cues");
  }

  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const groups = new Map();
  const insertionModes = new Map();
  const seen = new Set();
  const anchorCounts = new Map();
  const plannedCues = [];
  let previousStart = -1;
  let previousEnd = -1;

  for (let index = 0; index < cues.length; index += 1) {
    const request = cues[index];
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new Error("Vocal cue " + (index + 1) + " must be an object");
    }

    const definition = CUE_DEFINITIONS[request.cue];
    if (!definition) {
      throw new Error("Unsupported vocal cue: " + String(request.cue));
    }

    const anchorText = request.anchor_text;
    if (typeof anchorText !== "string" || !anchorText.trim() ||
        anchorText.length > 160 || /[\r\n]/u.test(anchorText)) {
      throw new Error("Vocal cue " + (index + 1) + " needs a single-line exact anchor (1–160 characters)");
    }

    const occurrence = request.occurrence ?? 1;
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
      throw new Error("Vocal cue " + (index + 1) + " occurrence must be an integer between 1 and 10");
    }

    const placement = request.placement ?? "before";
    if (placement !== "before" && placement !== "after") {
      throw new Error("Vocal cue " + (index + 1) + " placement must be before or after");
    }

    const layout = request.layout ?? "line";
    if (layout !== "line" && layout !== "inline") {
      throw new Error("Vocal cue " + (index + 1) + " layout must be line or inline");
    }

    let vocalization;
    if (request.vocalization !== undefined && request.vocalization !== null) {
      if (typeof request.vocalization !== "string") {
        throw new Error("Vocal cue " + (index + 1) + " vocalization must be text");
      }
      vocalization = request.vocalization.trim();
      if (!vocalization || vocalization.length > 40 || /[\[\]\r\n]/u.test(vocalization)) {
        throw new Error("Vocal cue " + (index + 1) + " vocalization must be 1–40 characters without brackets or line breaks");
      }
    }

    const start = findOccurrence(text, anchorText, occurrence);
    if (start < 0) {
      throw new Error("Vocal cue " + (index + 1) + " anchor was not found exactly in text: " + anchorText);
    }
    const end = start + anchorText.length;
    if (start < previousStart ||
        (start < previousEnd && !(start === previousStart && end === previousEnd))) {
      throw new Error("Vocal cues must be supplied in spoken-text order with non-overlapping anchors");
    }
    if (start !== previousStart || end !== previousEnd) {
      previousStart = start;
      previousEnd = end;
    }

    const duplicateKey = start + ":" + end + ":" + request.cue;
    if (seen.has(duplicateKey)) {
      throw new Error("Duplicate vocal cue for the same exact anchor: " + request.cue);
    }
    seen.add(duplicateKey);

    let position;
    if (layout === "line" && placement === "before") {
      if (start > 0 && !isBoundaryCharacter(text[start - 1])) {
        throw new Error("A line-layout cue before an anchor needs a phrase boundary; use inline layout inside a phrase");
      }
      position = start;
    } else if (layout === "line") {
      position = resolveLineAfterPosition(text, end);
    } else {
      position = placement === "before" ? start : end;
    }

    const existingMode = insertionModes.get(position);
    if (existingMode && existingMode !== layout) {
      throw new Error("Cues at the same text position must use the same layout");
    }
    insertionModes.set(position, layout);

    const token = "[" + definition.tag + "]" + (vocalization ? " " + vocalization : "");
    const groupKey = position + ":" + layout;
    let group = groups.get(groupKey);
    if (!group) {
      group = { position, layout, placement, tokens: [] };
      groups.set(groupKey, group);
    }
    group.tokens.push(token);

    const anchorKey = start + ":" + end;
    anchorCounts.set(anchorKey, (anchorCounts.get(anchorKey) || 0) + 1);
    plannedCues.push(Object.freeze({
      cue: request.cue,
      family: definition.family,
      label_zh: definition.label_zh,
      tag: "[" + definition.tag + "]",
      anchor_text: anchorText,
      occurrence,
      placement,
      layout,
      vocalization: vocalization || null,
      start,
      end,
      line: text.slice(0, start).split("\n").length,
      validation_status: "reference_candidate_unverified",
    }));
  }

  const warnings = [];
  for (const count of anchorCounts.values()) {
    if (count > 2) {
      warnings.push(count + " vocal tags target the same phrase; audition for tag stacking before using it in production.");
    }
  }

  let renderedText = text;
  const orderedGroups = [...groups.values()].sort((a, b) => b.position - a.position);
  for (const group of orderedGroups) {
    const insertion = renderInsertion(text, group, newline);
    renderedText = renderedText.slice(0, group.position) +
      insertion + renderedText.slice(group.position);
  }

  return Object.freeze({
    plan_only: true,
    text,
    rendered_text: renderedText,
    cue_count: plannedCues.length,
    estimated_tts_calls: 0,
    render_tool: "render_continuous_audio_timeline",
    cues: Object.freeze(plannedCues),
    warnings: Object.freeze(warnings),
    tag_validation: "Reference-derived candidates; not yet auditioned against the current Shin Voice.",
    notes: Object.freeze([
      "Only explicitly selected cues are rendered; no keyword inference is performed.",
      "Line layout places tags on their own line; inline layout keeps tags and optional vocalizations beside the anchored text.",
      "Audio tags are TTS performance instructions, not playable Foley assets.",
      "Use plan_foley_cues separately for physical action audio; each Foley action remains one primary asset.",
      "No ElevenLabs request was made while planning.",
    ]),
  });
}
