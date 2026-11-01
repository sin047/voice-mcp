import { soundscapeGain } from "./soundscape-levels.mjs";

export const FOLEY_ACTION_TYPES = Object.freeze([
  "clothing_rustle",
  "package_open",
  "box_open",
  "liquid_application",
  "continuous_rhythm",
  "bed_objects",
  "wet_detail",
  "ending_detail",
]);

const ACTIONS = Object.freeze({
  clothing_rustle: Object.freeze({
    assetName: "衣物摩擦",
    gain: soundscapeGain("contact", 2.25),
    pan: -0.38,
    distanceMeters: 1,
    fadeInSec: 0.15,
    fadeOutSec: 0.7,
    durationSec: 6,
    sourceOffsetSec: 12,
    normalizationTargetRms: 0.14,
  }),
  package_open: Object.freeze({
    assetName: "包装撕开",
    gain: soundscapeGain("action"),
    pan: -0.22,
    distanceMeters: 1.1,
    fadeInSec: 0.08,
    fadeOutSec: 0.35,
    durationSec: 1.8,
  }),
  box_open: Object.freeze({
    assetName: "盒子开封",
    gain: soundscapeGain("action", 2),
    pan: 0.2,
    distanceMeters: 1,
    fadeInSec: 0.06,
    fadeOutSec: 0.4,
    durationSec: 2.2,
    normalizationTargetRms: 0.14,
  }),
  liquid_application: Object.freeze({
    assetName: "润滑液涂抹",
    gain: soundscapeGain("detail", -4.5),
    pan: 0.16,
    distanceMeters: 0.9,
    fadeInSec: 0.2,
    fadeOutSec: 0.7,
    durationSec: 6,
  }),
  continuous_rhythm: Object.freeze({
    assetName: "连续节奏",
    gain: soundscapeGain("contact", 0.92),
    pan: -0.1,
    distanceMeters: 1.1,
    fadeInSec: 0.35,
    fadeOutSec: 0.9,
    durationSec: 8,
    normalizationTargetRms: 0.14,
  }),
  bed_objects: Object.freeze({
    assetName: "床铺物件声",
    gain: soundscapeGain("contact", 0.92),
    pan: 0.12,
    distanceMeters: 1.2,
    fadeInSec: 0.35,
    fadeOutSec: 0.9,
    durationSec: 8,
    normalizationTargetRms: 0.14,
  }),
  wet_detail: Object.freeze({
    assetName: "湿润细节",
    gain: soundscapeGain("detail"),
    pan: 0.48,
    distanceMeters: 1,
    fadeInSec: 0.12,
    fadeOutSec: 0.5,
    durationSec: 3.2,
    normalizationTargetRms: 0.14,
  }),
  ending_detail: Object.freeze({
    assetName: "收尾音效",
    gain: soundscapeGain("detail"),
    pan: 0,
    distanceMeters: 1,
    fadeInSec: 0.12,
    fadeOutSec: 0.65,
    durationSec: 4,
    normalizationTargetRms: 0.14,
  }),
});

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

/**
 * Build a deterministic, no-TTS Foley plan.
 * The caller chooses the action and quotes an exact text anchor; this module
 * only maps that intent to the approved private asset and approved cue levels.
 */
export function planFoleyCues({
  text,
  actions,
  assets = [],
  pureAudioTailSec = 0,
} = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > 1200) {
    throw new Error("text must contain 1–1200 characters");
  }
  if (!Array.isArray(actions) || actions.length < 1 || actions.length > 8) {
    throw new Error("actions must contain between 1 and 8 Foley actions");
  }
  if (!Array.isArray(assets)) {
    throw new Error("assets must be an array returned by the private sound library");
  }
  if (!Number.isFinite(pureAudioTailSec) || pureAudioTailSec < 0 || pureAudioTailSec > 15) {
    throw new Error("pureAudioTailSec must be between 0 and 15 seconds");
  }

  let previousAnchorEnd = -1;
  const cues = [];
  const warnings = [];

  for (let index = 0; index < actions.length; index += 1) {
    const request = actions[index];
    if (!request || typeof request !== "object" || Array.isArray(request)) {
      throw new Error("Action " + (index + 1) + " must be an object");
    }
    const definition = ACTIONS[request.action];
    if (!definition) {
      throw new Error("Unsupported Foley action: " + String(request.action));
    }
    const anchorText = request.after_text;
    if (typeof anchorText !== "string" || !anchorText.trim() || anchorText.length > 160) {
      throw new Error("Action " + (index + 1) + " needs an exact after_text anchor (1–160 characters)");
    }
    const occurrence = request.occurrence ?? 1;
    if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
      throw new Error("Action " + (index + 1) + " occurrence must be an integer between 1 and 10");
    }
    const anchorStart = findOccurrence(text, anchorText, occurrence);
    if (anchorStart < 0) {
      throw new Error("Action " + (index + 1) + " anchor was not found exactly in text: " + anchorText);
    }
    const anchorEnd = anchorStart + anchorText.length;
    if (anchorStart < previousAnchorEnd) {
      throw new Error("Foley actions must be supplied in spoken-text order with non-overlapping anchors");
    }
    previousAnchorEnd = anchorEnd;

    const asset = assets.find((item) =>
      item && item.kind === "foley" &&
      typeof item.name === "string" &&
      item.name.includes(definition.assetName)
    );
    if (!asset || typeof asset.id !== "string" || !asset.id) {
      throw new Error("Required Foley asset is not available: " + definition.assetName);
    }
    if (!Number.isFinite(asset.durationSec) || asset.durationSec <= 0) {
      throw new Error("Foley asset has no valid duration: " + definition.assetName);
    }

    const sourceOffsetSec = definition.sourceOffsetSec ?? 0;
    const sourceRemainingSec = Math.max(0, asset.durationSec - sourceOffsetSec);
    if (sourceRemainingSec < 0.1) {
      throw new Error("Foley asset is too short for its approved source offset: " + definition.assetName);
    }
    const requestedDuration = request.duration_sec ?? definition.durationSec;
    if (!Number.isFinite(requestedDuration) || requestedDuration < 0.1 || requestedDuration > 60) {
      throw new Error("Action duration must be between 0.1 and 60 seconds");
    }
    const durationSec = Math.min(requestedDuration, sourceRemainingSec);
    if (durationSec < requestedDuration) {
      warnings.push(definition.assetName + " duration capped to available source audio (" + durationSec.toFixed(2) + "s)");
    }

    const fadeInSec = Math.min(definition.fadeInSec, durationSec / 2);
    const fadeOutSec = Math.min(definition.fadeOutSec, durationSec / 2);
    cues.push({
      action: request.action,
      asset_id: asset.id,
      kind: "foley",
      after_text: anchorText,
      occurrence,
      duration_sec: durationSec,
      gain: definition.gain,
      pan: definition.pan,
      distance_meters: definition.distanceMeters,
      fade_in_sec: fadeInSec,
      fade_out_sec: fadeOutSec,
      source_offset_sec: sourceOffsetSec,
      ...(definition.normalizationTargetRms == null
        ? {}
        : { normalization_target_rms: definition.normalizationTargetRms }),
      loop: false,
      anchor_start: anchorStart,
      anchor_end: anchorEnd,
    });
  }

  if (pureAudioTailSec > 0) {
    const lastCue = cues[cues.length - 1];
    const remainingText = text.slice(lastCue.anchor_end).trim();
    if (remainingText && !/^[，。！？、；：,.!?…'"”’）】》」』]*$/u.test(remainingText)) {
      throw new Error("For a pure-audio tail, the last Foley anchor must be at the end of the spoken text");
    }
  }

  return Object.freeze({
    plan_only: true,
    estimated_tts_calls: 0,
    requires_alignment_at_render: true,
    render_tool: "render_continuous_audio_timeline",
    sequence_foley: true,
    tail_duration_sec: pureAudioTailSec,
    action_count: cues.length,
    cues: Object.freeze(cues.map((cue) => Object.freeze(cue))),
    warnings: Object.freeze(warnings),
    notes: Object.freeze([
      "No ElevenLabs request was made while planning.",
      "Each action maps to exactly one uploaded Foley asset.",
      "Exact after_text anchors are resolved against provider character timestamps during rendering.",
      "Sequential Foley cues are trimmed at the next cue boundary so action sounds do not overlap.",
    ]),
  });
}
