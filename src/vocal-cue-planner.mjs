const CUE_DEFINITIONS = Object.freeze({
  soft_inhale: Object.freeze({
    family: "breath", category: "breath", label_zh: "轻颤吸气",
    tag: "soft shuddering inhale",
    validation_status: "positive_combined_audition",
    recommended_use: "需要轻微、向内的颤抖吸气时；目前只通过组合试听。",
  }),
  heavy_ragged_breathing: Object.freeze({
    family: "breath", category: "breath", label_zh: "急促粗重喘息",
    tag: "heavy ragged breathing",
    validation_status: "approved_preferred",
    recommended_use: "喘息本身是前景、需要持续粗重呼吸时；目前首选呼吸提示。",
  }),
  ragged_exhale: Object.freeze({
    family: "breath", category: "breath", label_zh: "粗重呼气",
    tag: "ragged exhale",
    validation_status: "approved_complement",
    recommended_use: "需要短促、明显的呼气释放时；作为喘息的补充而非每句必加。",
  }),
  warm_exhale: Object.freeze({
    family: "breath", category: "breath", label_zh: "温热呼气",
    tag: "warm exhale",
    validation_status: "not_preferred_after_audition",
    recommended_use: "目前不作为句末独立音效；已试听的句末位置显得突兀。",
  }),
  close_whisper: Object.freeze({
    family: "voice", category: "voice_state", label_zh: "贴近耳边低语",
    tag: "intense close-up whisper against ear",
    validation_status: "positive_combined_audition",
    recommended_use: "台词需要明显贴近、耳语式表达时；目前通过组合试听。",
  }),
  husky_low_whisper: Object.freeze({
    family: "voice", category: "voice_state", label_zh: "沙哑低声耳语",
    tag: "husky low whisper",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选低声沙哑表达；尚未在当前声音上单独试听。",
  }),
  breathless_husky_whisper: Object.freeze({
    family: "voice", category: "voice_state", label_zh: "气息不稳的沙哑低语",
    tag: "breathless husky whisper",
    validation_status: "approved_spoken_delivery",
    recommended_use: "台词本身需要带喘息感、略沙哑的说话状态；不是非语言喘息。",
  }),
  gentle_growl: Object.freeze({
    family: "voice", category: "voice_state", label_zh: "轻柔喉音",
    tag: "gentle possessive growl",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选喉音表达；尚未在当前声音上试听。",
  }),
  deep_wet_kiss: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "深吻",
    tag: "deep, messy wet kiss",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选口腔/接触表现；先小批试听，不与多个同类标签堆叠。",
  }),
  wet_licking: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "湿润舔舐",
    tag: "deep, messy wet licking",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选口腔/接触表现；先确认当前声音是否自然实现。",
  }),
  wet_sucking: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "湿润吮吸",
    tag: "wet sucking",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选口腔/接触表现；先确认当前声音是否自然实现。",
  }),
  wet_squelch: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "湿润挤压声",
    tag: "wet squelch",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选声音提示，不等同于独立 Foley 音频素材。",
  }),
  sticky_parting: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "湿黏分离声",
    tag: "sticky wet parting",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选口腔/接触表现；尚未在当前声音上试听。",
  }),
  swallowing_hard: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "用力吞咽",
    tag: "swallowing hard",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选吞咽表现；尚未在当前声音上试听。",
  }),
  lower_lip_suck: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "下唇轻吮",
    tag: "soft suck on the lower lip",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选口腔/接触表现；尚未在当前声音上试听。",
  }),
  neck_bite: Object.freeze({
    family: "mouth", category: "mouth_contact", label_zh: "颈部轻咬",
    tag: "firm bite on the neck",
    validation_status: "reference_candidate_unverified",
    recommended_use: "候选接触表现；尚未在当前声音上试听。",
  }),
});

export const VOCAL_CUE_TYPES = Object.freeze(Object.keys(CUE_DEFINITIONS));

const VOCAL_CATEGORY_GROUPS = Object.freeze([
  Object.freeze({ id: "breath", label_zh: "呼吸", family: "breath", description: "吸气、持续喘息和呼气等非语言呼吸表现。" }),
  Object.freeze({ id: "voice_state", label_zh: "说话状态", family: "voice", description: "影响台词本身的距离感、气息感、沙哑度或喉音表现。" }),
  Object.freeze({ id: "mouth_contact", label_zh: "口腔与接触声音", family: "mouth", description: "参考图中的亲吻、舔舐、吮吸、吞咽等 TTS 表现候选。" }),
]);

export function getVocalCueCatalog({ foleyActions = [] } = {}) {
  const actionItems = Array.isArray(foleyActions)
    ? foleyActions.map((item) => Object.freeze({ ...item }))
    : [];
  const vocalCategories = VOCAL_CATEGORY_GROUPS.map((category) => Object.freeze({
    id: category.id,
    label_zh: category.label_zh,
    kind: "tts_vocal_cue",
    tool: "plan_vocal_cues",
    description: category.description,
    items: Object.freeze(Object.entries(CUE_DEFINITIONS)
      .filter(([, definition]) => definition.family === category.family)
      .map(([id, definition]) => Object.freeze({
        id,
        family: definition.family,
        category: definition.category,
        label_zh: definition.label_zh,
        tag: definition.tag,
        validation_status: definition.validation_status,
        recommended_use: definition.recommended_use,
      }))),
  }));

  const categories = [
    ...vocalCategories,
    Object.freeze({
      id: "physical_action",
      label_zh: "动作音效",
      kind: "separate_audio_asset",
      tool: "plan_foley_cues",
      description: "独立 Foley 音频素材；每个明确选择的动作对应一个主要素材，不由 TTS 标签代替。",
      items: Object.freeze(actionItems),
    }),
    Object.freeze({
      id: "ending_transition",
      label_zh: "余韵过渡",
      kind: "arrangement_pattern",
      tool: "plan_vocal_cues",
      description: "段落级编排概念，不是新的 TTS 标签，也不会自动生成音频。",
      items: Object.freeze([Object.freeze({
        id: "afterglow",
        label_zh: "Afterglow / 余韵放缓",
        is_tts_tag: false,
        tag: null,
        validation_status: "arrangement_guidance_only",
        recommended_use: "让强度逐步放缓：如场景需要，可保留一段已认可的喘息，再过渡到带气息的台词，最后回到不加标签的放松收尾。",
        sequence: Object.freeze([
          Object.freeze({ phase: "breathing_if_needed", cue: "heavy_ragged_breathing", optional: true }),
          Object.freeze({ phase: "breath_inflected_dialogue_if_needed", cue: "breathless_husky_whisper", optional: true }),
          Object.freeze({ phase: "relaxed_closing_line", cue: null, instruction: "最后一句默认不加表演标签。" }),
          Object.freeze({ phase: "natural_settle", cue: null, instruction: "保留自然停顿；不默认追加 warm_exhale。" }),
        ]),
      })]),
    }),
  ];

  return Object.freeze({
    plan_only: true,
    estimated_tts_calls: 0,
    category_count: categories.length,
    categories: Object.freeze(categories),
    notes: Object.freeze([
      "Five categories keep TTS vocal cues, separate Foley assets, and ending arrangements distinct.",
      "Afterglow is an arrangement pattern, not a TTS tag.",
      "Validation status is voice- and placement-specific; unverified candidates need listening tests.",
      "Listing this catalogue makes no ElevenLabs request.",
    ]),
  });
}

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
  const needsSpaceAfter = next !== undefined && !/\s/u.test(next) && !TRAILING_PUNCTUATION.has(next);
  if (group.placement === "before") {
    return tokens + (needsSpaceAfter ? " " : "");
  }
  const needsSpaceBefore = previous !== undefined && !/\s/u.test(previous);
  return (needsSpaceBefore ? " " : "") + tokens + (needsSpaceAfter ? " " : "");
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
    if (existingMode && (existingMode.layout !== layout ||
        (layout === "inline" && existingMode.placement !== placement))) {
      throw new Error("Cues at the same text position must use a consistent layout and placement");
    }
    if (!existingMode) insertionModes.set(position, { layout, placement });

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
      category: definition.category,
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
      validation_status: definition.validation_status,
      recommended_use: definition.recommended_use,
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
    tag_validation: "Per-cue listening status is included; validation is specific to the current voice and tested placement.",
    notes: Object.freeze([
      "Only explicitly selected cues are rendered; no keyword inference is performed.",
      "Line layout places tags on their own line; inline layout keeps tags and optional vocalizations beside the anchored text.",
      "Audio tags are TTS performance instructions, not playable Foley assets.",
      "Use plan_foley_cues separately for physical action audio; each Foley action remains one primary asset.",
      "No ElevenLabs request was made while planning.",
    ]),
  });
}
