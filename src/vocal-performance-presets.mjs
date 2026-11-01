import { getVocalCueCatalog, planVocalCues } from "./vocal-cue-planner.mjs";

const ELIGIBLE_CUE_STATUSES = new Set([
  "positive_combined_audition",
  "approved_preferred",
  "approved_complement",
  "approved_spoken_delivery",
]);

const PRESETS = Object.freeze({
  close_soft: Object.freeze({
    label_zh: "轻柔贴近",
    description: "先以轻微吸气进入，再切换到贴近耳边的低语。",
    validation_status: "positive_combined_audition",
    validation_note: "这两个标签作为分开的两个节拍组合试听通过；不代表每个标签都经过独立 A/B 验证。",
    min_cue_slots: 2,
    slots: Object.freeze([
      Object.freeze({ id: "inhale", label_zh: "吸气节拍", cue: "soft_inhale", required: true, placement: "before", layout: "line" }),
      Object.freeze({ id: "whisper", label_zh: "贴近低语", cue: "close_whisper", required: true, placement: "before", layout: "line" }),
    ]),
  }),
  heavy_breathing: Object.freeze({
    label_zh: "持续粗重喘息",
    description: "让非语言喘息成为前景；不把它误当成带喘息感的台词。",
    validation_status: "approved_preferred",
    validation_note: "heavy ragged breathing 是当前首选的持续喘息提示。",
    min_cue_slots: 1,
    slots: Object.freeze([
      Object.freeze({ id: "breathing", label_zh: "喘息位置", cue: "heavy_ragged_breathing", required: true, placement: "after", layout: "line" }),
    ]),
  }),
  breathless_dialogue: Object.freeze({
    label_zh: "带喘息的低语台词",
    description: "改变正在说出的台词状态；它不是一段独立的非语言喘息。",
    validation_status: "approved_spoken_delivery",
    validation_note: "当前声音试听反馈更真实；只作用于指定的台词节拍。",
    min_cue_slots: 1,
    slots: Object.freeze([
      Object.freeze({ id: "dialogue", label_zh: "带喘息的台词", cue: "breathless_husky_whisper", required: true, placement: "before", layout: "inline" }),
    ]),
  }),
  ragged_release: Object.freeze({
    label_zh: "短促粗重呼气",
    description: "在指定短句之后加入一次呼气释放；不自动附加到每句台词。",
    validation_status: "approved_complement",
    validation_note: "ragged exhale 已通过组合试听，定位为补充而不是持续喘息。",
    min_cue_slots: 1,
    slots: Object.freeze([
      Object.freeze({ id: "release", label_zh: "呼气位置", cue: "ragged_exhale", required: true, placement: "after", layout: "line" }),
    ]),
  }),
  breathing_to_dialogue: Object.freeze({
    label_zh: "喘息过渡到说话",
    description: "先安排一段非语言粗重喘息，再让下一句台词以气息不稳的低语说出。",
    validation_status: "composition_not_yet_auditioned",
    validation_note: "两个组成标签分别已有正向试听反馈，但这个组合顺序尚未单独试听。",
    min_cue_slots: 2,
    slots: Object.freeze([
      Object.freeze({ id: "breathing", label_zh: "非语言喘息", cue: "heavy_ragged_breathing", required: true, placement: "after", layout: "line" }),
      Object.freeze({ id: "dialogue", label_zh: "带喘息的台词", cue: "breathless_husky_whisper", required: true, placement: "before", layout: "inline" }),
    ]),
  }),
  afterglow: Object.freeze({
    label_zh: "Afterglow / 余韵放缓",
    description: "从仍未平复的呼吸逐步过渡到放松、自然且不加标签的收尾台词。",
    validation_status: "arrangement_guidance_only",
    validation_note: "这是段落编排指导，不是 TTS 标签或独立音效；完整序列尚未作为整体试听。",
    min_cue_slots: 1,
    slots: Object.freeze([
      Object.freeze({ id: "breathing", label_zh: "余韵中的喘息", cue: "heavy_ragged_breathing", required: false, placement: "after", layout: "line" }),
      Object.freeze({ id: "breathless_dialogue", label_zh: "仍带气息的台词", cue: "breathless_husky_whisper", required: false, placement: "before", layout: "inline" }),
      Object.freeze({ id: "closing_line", label_zh: "放松收尾台词", cue: null, required: true, placement: null, layout: null, instruction: "收尾台词保持不加表演标签。" }),
    ]),
    arrangement: Object.freeze({
      type: "ending_transition",
      sequence: Object.freeze([
        Object.freeze({ slot: "breathing", optional: true, instruction: "如需要，保留一段已认可的持续喘息。" }),
        Object.freeze({ slot: "breathless_dialogue", optional: true, instruction: "如需要，让过渡台词仍带一点气息感。" }),
        Object.freeze({ slot: "closing_line", required: true, instruction: "最后一句保持自然说话，不添加 TTS 标签。" }),
        Object.freeze({ slot: "natural_settle", instruction: "留出自然停顿；不默认追加 warm_exhale。" }),
      ]),
    }),
  }),
});

export const VOCAL_PRESET_IDS = Object.freeze(Object.keys(PRESETS));

function getCueIndex() {
  const catalog = getVocalCueCatalog();
  const items = catalog.categories
    .filter((category) => category.kind === "tts_vocal_cue")
    .flatMap((category) => category.items);
  return new Map(items.map((item) => [item.id, item]));
}

function getSlotCueMetadata(slot, cueIndex) {
  if (!slot.cue) return null;
  const cue = cueIndex.get(slot.cue);
  if (!cue) throw new Error("Preset references an unknown vocal cue: " + slot.cue);
  if (!ELIGIBLE_CUE_STATUSES.has(cue.validation_status)) {
    throw new Error("Preset cannot automatically include an unverified or not-preferred cue: " + slot.cue);
  }
  return cue;
}

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

export function listVocalPerformancePresets() {
  const cueIndex = getCueIndex();
  const presets = Object.entries(PRESETS).map(([id, preset]) => Object.freeze({
    id,
    label_zh: preset.label_zh,
    description: preset.description,
    validation_status: preset.validation_status,
    validation_note: preset.validation_note,
    slots: Object.freeze(preset.slots.map((slot) => {
      const cue = getSlotCueMetadata(slot, cueIndex);
      return Object.freeze({
        id: slot.id,
        label_zh: slot.label_zh,
        cue: slot.cue,
        tag: cue?.tag ?? null,
        required: slot.required,
        placement: slot.placement,
        layout: slot.layout,
        validation_status: cue?.validation_status ?? "not_applicable_untagged",
        recommended_use: cue?.recommended_use ?? slot.instruction,
      });
    })),
    ...(preset.arrangement ? { arrangement: preset.arrangement } : {}),
  }));

  return Object.freeze({
    plan_only: true,
    estimated_tts_calls: 0,
    preset_count: presets.length,
    presets: Object.freeze(presets),
    notes: Object.freeze([
      "Presets use only cues with positive or approved listening status; unverified mouth/contact candidates are not auto-included.",
      "The close_soft pair passed a combined audition; breathing_to_dialogue and the complete Afterglow sequence are not yet auditioned as combinations.",
      "Afterglow is an arrangement pattern, not a TTS tag. The closing line remains untagged and warm_exhale is not appended by default.",
      "Vocal presets do not add Foley. Physical actions remain a separate one-action-to-one-primary-asset workflow.",
      "Listing presets makes no ElevenLabs request and consumes no TTS credits.",
    ]),
  });
}

export function planVocalPreset({ text, preset, anchors } = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 1200) {
    throw new Error("text must contain 1–1200 characters");
  }
  const definition = PRESETS[preset];
  if (!definition) {
    throw new Error("Unsupported vocal preset: " + String(preset) + ". Supported presets: " + VOCAL_PRESET_IDS.join(", "));
  }
  if (!Array.isArray(anchors) || anchors.length < 1 || anchors.length > 6) {
    throw new Error("anchors must contain between 1 and 6 exact preset-slot anchors");
  }

  const slotIndex = new Map(definition.slots.map((slot, index) => [slot.id, index]));
  const seenSlots = new Set();
  const resolved = [];
  let previousSlotIndex = -1;
  let previousAnchorEnd = -1;

  for (let index = 0; index < anchors.length; index += 1) {
    const request = anchors[index];
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new Error("Anchor " + (index + 1) + " must be an object");
    }
    if (typeof request.slot !== "string" || !slotIndex.has(request.slot)) {
      throw new Error("Unknown slot for preset " + preset + ": " + String(request.slot));
    }
    if (seenSlots.has(request.slot)) {
      throw new Error("Duplicate preset slot: " + request.slot);
    }
    const currentSlotIndex = slotIndex.get(request.slot);
    if (currentSlotIndex <= previousSlotIndex) {
      throw new Error("Preset anchors must be supplied in the defined slot order");
    }
    previousSlotIndex = currentSlotIndex;
    seenSlots.add(request.slot);

    if (typeof request.anchor_text !== "string" || !request.anchor_text.trim() ||
        request.anchor_text.length > 160 || /[\r\n]/u.test(request.anchor_text)) {
      throw new Error("Anchor " + (index + 1) + " needs a single-line exact anchor (1–160 characters)");
    }
    const occurrence = request.occurrence ?? 1;
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
      throw new Error("Anchor " + (index + 1) + " occurrence must be an integer between 1 and 10");
    }
    const start = findOccurrence(text, request.anchor_text, occurrence);
    if (start < 0) {
      throw new Error("Anchor for slot " + request.slot + " was not found exactly in text: " + request.anchor_text);
    }
    const end = start + request.anchor_text.length;
    if (start < previousAnchorEnd) {
      throw new Error("Preset anchors must point to distinct, non-overlapping phrases in spoken-text order");
    }
    previousAnchorEnd = end;
    resolved.push(Object.freeze({
      ...definition.slots[currentSlotIndex],
      anchor_text: request.anchor_text,
      occurrence,
      start,
      end,
    }));
  }

  for (const slot of definition.slots) {
    if (slot.required && !seenSlots.has(slot.id)) {
      throw new Error("Missing required preset slot: " + slot.id);
    }
  }
  const cueSlots = resolved.filter((slot) => slot.cue);
  if (cueSlots.length < definition.min_cue_slots) {
    throw new Error("Preset " + preset + " needs at least " + definition.min_cue_slots + " vocal cue slot(s)");
  }

  const cueIndex = getCueIndex();
  const cueRequests = cueSlots.map((slot) => {
    const cue = getSlotCueMetadata(slot, cueIndex);
    return {
      cue: slot.cue,
      anchor_text: slot.anchor_text,
      occurrence: slot.occurrence,
      placement: slot.placement,
      layout: slot.layout,
    };
  });
  const plan = planVocalCues({ text, cues: cueRequests });
  const resolvedSlots = resolved.map((slot) => {
    const cue = getSlotCueMetadata(slot, cueIndex);
    return Object.freeze({
      slot: slot.id,
      label_zh: slot.label_zh,
      cue: slot.cue,
      tag: cue?.tag ?? null,
      anchor_text: slot.anchor_text,
      occurrence: slot.occurrence,
      placement: slot.placement,
      layout: slot.layout,
      validation_status: cue?.validation_status ?? "not_applicable_untagged",
      is_untagged: !slot.cue,
      instruction: slot.instruction ?? null,
    });
  });

  const warnings = [...plan.warnings];
  if (definition.validation_status === "composition_not_yet_auditioned") {
    warnings.push("The component cues are approved individually/in prior combinations, but this preset sequence has not yet been auditioned as a whole.");
  }
  if (definition.validation_status === "arrangement_guidance_only") {
    warnings.push("Afterglow is arrangement guidance, not a dedicated sound or TTS tag; keep the final line untagged and do not append warm_exhale by default.");
  }

  return Object.freeze({
    plan_only: true,
    preset,
    preset_label_zh: definition.label_zh,
    preset_validation_status: definition.validation_status,
    preset_validation_note: definition.validation_note,
    text,
    rendered_text: plan.rendered_text,
    cue_count: plan.cue_count,
    estimated_tts_calls: 0,
    slots: Object.freeze(resolvedSlots),
    cues: plan.cues,
    warnings: Object.freeze(warnings),
    arrangement: definition.arrangement ?? Object.freeze({
      type: "vocal_bundle",
      sequence: Object.freeze(resolvedSlots.map((slot) => Object.freeze({
        slot: slot.slot,
        cue: slot.cue,
        anchor_text: slot.anchor_text,
        placement: slot.placement,
        layout: slot.layout,
      }))),
    }),
    notes: Object.freeze([
      "This is a deterministic planning tool; no ElevenLabs request or audio render was made.",
      "Review rendered_text before passing it to render_continuous_audio_timeline.",
      "Foley assets are not included; plan physical actions separately with plan_foley_cues.",
    ]),
  });
}
