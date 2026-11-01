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
    fadeInSec: 0.1,
    fadeOutSec: 0.35,
    durationSec: 2.4,
    sourceOffsetSec: 12,
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
    });
  }

  if (pureAudioTailSec > 0) {
    const remainingText = text.slice(previousAnchorEnd).trim();
    if (remainingText && !/^[，。！？、；：,.!?…'"”’）】》」』]*$/u.test(remainingText)) {
      throw new Error("For a pure-audio tail, the last Foley anchor must be at the end of the spoken text");
    }
  }

  return Object.freeze({
    plan_only: true,
    text,
    estimated_tts_calls: 0,
    requires_alignment_at_render: true,
    render_tool: "render_continuous_audio_timeline",
    sequence_foley: true,
    tail_duration_sec: pureAudioTailSec,
    action_count: cues.length,
    cues: Object.freeze(cues.map((cue) => Object.freeze(cue))),
    action_order: Object.freeze(actions.map((request) => request.action)),
    anchor_order: Object.freeze(actions.map((request) => Object.freeze({
      after_text: request.after_text,
      occurrence: request.occurrence ?? 1,
      start: findOccurrence(text, request.after_text, request.occurrence ?? 1),
    }))),
    warnings: Object.freeze(warnings),
    notes: Object.freeze([
      "No ElevenLabs request was made while planning.",
      "Each action maps to exactly one uploaded Foley asset.",
      "Exact after_text anchors are resolved against provider character timestamps during rendering.",
      "Sequential Foley cues are trimmed at the next cue boundary so action sounds do not overlap.",
    ]),
  });
}

/**
 * Cap sequential Foley cues so one action sound ends before the next begins.
 * Ambience cues are deliberately left untouched.
 */
export function sequenceFoleyCues(cues, assetMetadata, timelineDurationSec) {
  if (!Array.isArray(cues)) throw new Error("cues must be an array");
  if (!(assetMetadata instanceof Map)) throw new Error("assetMetadata must be a Map");
  if (!Number.isFinite(timelineDurationSec) || timelineDurationSec <= 0) {
    throw new Error("timelineDurationSec must be a positive number");
  }

  const normalized = cues.map((cue) => ({ ...cue }));
  const ordered = normalized
    .map((cue, index) => ({ cue, index }))
    .filter(({ cue }) => cue.kind === "foley")
    .sort((a, b) => a.cue.atSec - b.cue.atSec);
  const adjustments = [];

  for (let index = 0; index < ordered.length; index += 1) {
    const { cue } = ordered[index];
    const metadata = assetMetadata.get(cue.fileId);
    const sourceRemainingSec = Math.max(0,
      (metadata?.durationSec ?? 0) - (cue.sourceOffsetSec ?? 0));
    if (sourceRemainingSec < 0.1) {
      throw new Error("Foley source is too short at the selected source offset: " + cue.fileId);
    }

    let durationSec = Math.min(cue.durationSec ?? sourceRemainingSec, sourceRemainingSec);
    const nextCue = ordered[index + 1]?.cue;
    if (nextCue) {
      const availableWindowSec = nextCue.atSec - cue.atSec;
      if (availableWindowSec < 0.1) {
        throw new Error("Sequential Foley anchors resolve too close together; move one action anchor later");
      }
      if (durationSec > availableWindowSec) {
        durationSec = availableWindowSec;
        adjustments.push({
          asset_id: cue.fileId,
          trimmed_to_sec: Number(durationSec.toFixed(3)),
          reason: "next Foley action starts",
        });
      }
    }

    durationSec = Math.min(durationSec, timelineDurationSec - cue.atSec);
    if (durationSec < 0.1) {
      throw new Error("Sequential Foley cue has no usable playback window");
    }
    cue.durationSec = durationSec;
    cue.fadeInSec = Math.min(cue.fadeInSec ?? 0.03, durationSec / 2);
    cue.fadeOutSec = Math.min(cue.fadeOutSec ?? 0.1, durationSec / 2);
  }

  return Object.freeze({
    cues: Object.freeze(normalized.map((cue) => Object.freeze(cue))),
    adjustments: Object.freeze(adjustments.map((item) => Object.freeze(item))),
  });
}

/**
 * Resolve the final WAV duration without guessing the TTS duration in advance.
 * Relative tails are safely capped at the service's maximum output duration.
 */
export function resolveFoleyTimelineDuration({
  voiceDurationSec,
  timelineDurationSec,
  tailDurationSec,
  maxDurationSec = 60,
} = {}) {
  if (!Number.isFinite(voiceDurationSec) || voiceDurationSec <= 0) {
    throw new Error("voiceDurationSec must be a positive finite number");
  }
  if (!Number.isFinite(maxDurationSec) || maxDurationSec <= 0) {
    throw new Error("maxDurationSec must be a positive finite number");
  }
  if (voiceDurationSec > maxDurationSec) {
    throw new Error("Voice duration exceeds the maximum timeline duration");
  }
  if (timelineDurationSec != null && tailDurationSec != null) {
    throw new Error("Use either timelineDurationSec or tailDurationSec, not both");
  }

  if (timelineDurationSec != null) {
    if (!Number.isFinite(timelineDurationSec) ||
        timelineDurationSec + 0.001 < voiceDurationSec ||
        timelineDurationSec > maxDurationSec) {
      throw new Error("timelineDurationSec must fit the voice and maximum timeline duration");
    }
    return Object.freeze({
      durationSec: timelineDurationSec,
      tailDurationSec: Math.max(0, timelineDurationSec - voiceDurationSec),
      requestedTailDurationSec: null,
      tailClamped: false,
    });
  }

  const requestedTail = tailDurationSec ?? 0;
  if (!Number.isFinite(requestedTail) || requestedTail < 0 || requestedTail > 15) {
    throw new Error("tailDurationSec must be between 0 and 15 seconds");
  }
  const actualTail = Math.min(requestedTail, Math.max(0, maxDurationSec - voiceDurationSec));
  return Object.freeze({
    durationSec: voiceDurationSec + actualTail,
    tailDurationSec: actualTail,
    requestedTailDurationSec: requestedTail,
    tailClamped: actualTail + 0.001 < requestedTail,
  });
}
