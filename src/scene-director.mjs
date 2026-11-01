import { resolveCueTimeAfterText } from "./alignment-cues.mjs";
import { planFoleyCues } from "./foley-cue-planner.mjs";
import { buildSoundscapePresetCues } from "./soundscape-presets.mjs";
import { planVocalPreset } from "./vocal-performance-presets.mjs";

const MAX_SCENE_CHARS = 1200;
const MAX_BEATS = 12;
const MAX_PAUSE_TOTAL_MS = 10000;
const AMBIENCE_PRESETS = new Set(["rain", "desk"]);

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

function normalizeBeatId(value, index) {
  const id = value == null ? "beat_" + (index + 1) : String(value).trim();
  if (!id || id.length > 40) throw new Error("Beat " + (index + 1) + " needs an id of 1–40 characters");
  return id;
}

function toRendererCue(cue) {
  return {
    asset_id: cue.fileId,
    kind: cue.kind,
    at_sec: cue.atSec,
    ...(cue.durationSec == null ? {} : { duration_sec: cue.durationSec }),
    ...(cue.gain == null ? {} : { gain: cue.gain }),
    ...(cue.pan == null ? {} : { pan: cue.pan }),
    ...(cue.distanceMeters == null ? {} : { distance_meters: cue.distanceMeters }),
    ...(cue.fadeInSec == null ? {} : { fade_in_sec: cue.fadeInSec }),
    ...(cue.fadeOutSec == null ? {} : { fade_out_sec: cue.fadeOutSec }),
    ...(cue.sourceOffsetSec == null ? {} : { source_offset_sec: cue.sourceOffsetSec }),
    ...(cue.normalizationTargetRms == null ? {} : { normalization_target_rms: cue.normalizationTargetRms }),
    ...(cue.loop == null ? {} : { loop: cue.loop }),
  };
}

/**
 * Compose explicitly selected vocal presets, pauses, ambience and Foley into
 * one deterministic render request. This planner never infers actions from text
 * and never calls TTS.
 */
export function planSceneDirector({
  text,
  beats,
  foleyActions = [],
  ambiencePreset,
  assets = [],
  tailDurationSec = 0,
} = {}) {
  if (typeof text !== "string" || !text.trim() || text.length > MAX_SCENE_CHARS) {
    throw new Error("text must contain 1–1200 characters");
  }
  if (!Array.isArray(beats) || beats.length < 1 || beats.length > MAX_BEATS) {
    throw new Error("beats must contain between 1 and 12 ordered scene beats");
  }
  if (!Array.isArray(foleyActions) || foleyActions.length > 8) {
    throw new Error("foleyActions must contain no more than 8 explicit Foley actions");
  }
  if (!Array.isArray(assets)) {
    throw new Error("assets must be an array returned by the private sound library");
  }
  if (!Number.isFinite(tailDurationSec) || tailDurationSec < 0 || tailDurationSec > 15) {
    throw new Error("tailDurationSec must be between 0 and 15 seconds");
  }
  if (ambiencePreset != null && !AMBIENCE_PRESETS.has(ambiencePreset)) {
    throw new Error("Unsupported ambience preset: " + String(ambiencePreset) + ". Supported presets: rain, desk");
  }

  let reconstructedText = "";
  let renderedText = "";
  let hasVocalTags = false;
  const seenBeatIds = new Set();
  const beatPlans = [];
  const pauses = [];
  const warnings = [];
  let pauseTotalMs = 0;
  let previousPauseEnd = -1;

  for (let index = 0; index < beats.length; index += 1) {
    const beat = beats[index];
    if (!beat || typeof beat !== "object" || Array.isArray(beat)) {
      throw new Error("Beat " + (index + 1) + " must be an object");
    }
    if (typeof beat.text !== "string" || !beat.text.length) {
      throw new Error("Beat " + (index + 1) + " needs non-empty exact text");
    }
    const id = normalizeBeatId(beat.id, index);
    if (seenBeatIds.has(id)) throw new Error("Duplicate scene beat id: " + id);

    const beatStart = reconstructedText.length;
    reconstructedText += beat.text;
    const beatEnd = reconstructedText.length;
    seenBeatIds.add(id);

    let vocalPlan = null;
    if (beat.vocal_preset != null) {
      vocalPlan = planVocalPreset({
        text: beat.text,
        preset: beat.vocal_preset,
        anchors: beat.anchors,
      });
      renderedText += vocalPlan.rendered_text;
      hasVocalTags ||= vocalPlan.cue_count > 0;
      warnings.push(...vocalPlan.warnings.map((warning) => id + ": " + warning));
    } else {
      if (beat.anchors != null) {
        throw new Error("Beat " + id + " supplies vocal anchors without a vocal_preset");
      }
      renderedText += beat.text;
    }

    const hasPauseMs = beat.pause_after_ms != null;
    const hasPauseAnchor = beat.pause_after_text != null;
    if (hasPauseMs !== hasPauseAnchor) {
      throw new Error("Beat " + id + " must provide both pause_after_ms and pause_after_text");
    }
    if (hasPauseMs) {
      const durationMs = beat.pause_after_ms;
      if (!Number.isInteger(durationMs) || durationMs < 80 || durationMs > 3000) {
        throw new Error("Beat " + id + " pause_after_ms must be an integer between 80 and 3000");
      }
      const afterText = beat.pause_after_text;
      if (typeof afterText !== "string" || !afterText.trim() || afterText.length > 160 || /[\r\n]/u.test(afterText)) {
        throw new Error("Beat " + id + " pause_after_text must be a single-line exact phrase (1–160 characters)");
      }
      const occurrence = beat.pause_after_occurrence ?? 1;
      if (!Number.isInteger(occurrence) || occurrence < 1 || occurrence > 10) {
        throw new Error("Beat " + id + " pause_after_occurrence must be an integer between 1 and 10");
      }
      const start = findOccurrence(text, afterText, occurrence);
      if (start < beatStart || start + afterText.length > beatEnd) {
        throw new Error("Beat " + id + " pause anchor must occur inside that beat at the selected global occurrence");
      }
      if (start < previousPauseEnd) {
        throw new Error("Scene pauses must follow spoken-text order and use non-overlapping anchors");
      }
      previousPauseEnd = start + afterText.length;
      pauseTotalMs += durationMs;
      if (pauseTotalMs > MAX_PAUSE_TOTAL_MS) {
        throw new Error("Total inserted scene pauses cannot exceed 10000 ms");
      }
      pauses.push(Object.freeze({
        after_text: afterText,
        occurrence,
        duration_ms: durationMs,
        beat_id: id,
      }));
    } else if (beat.pause_after_occurrence != null) {
      throw new Error("Beat " + id + " cannot set pause_after_occurrence without a pause");
    }

    beatPlans.push(Object.freeze({
      id,
      text: beat.text,
      rendered_text: vocalPlan?.rendered_text ?? beat.text,
      vocal_preset: beat.vocal_preset ?? null,
      vocal_validation_status: vocalPlan?.preset_validation_status ?? "untagged_natural",
      vocal_cue_count: vocalPlan?.cue_count ?? 0,
      pause_after_ms: hasPauseMs ? beat.pause_after_ms : 0,
      pause_after_text: hasPauseAnchor ? beat.pause_after_text : null,
    }));
  }

  if (reconstructedText !== text) {
    throw new Error("Ordered beat text must concatenate exactly to the scene text");
  }
  if (hasVocalTags && /\[[A-Za-z][^\]\r\n]{0,179}\]/u.test(text)) {
    throw new Error("Scene source text must not contain existing bracketed audio tags; add approved tags through vocal presets");
  }

  let foleyPlan = null;
  if (foleyActions.length > 0) {
    foleyPlan = planFoleyCues({
      text,
      actions: foleyActions,
      assets,
      pureAudioTailSec: tailDurationSec,
    });
    warnings.push(...foleyPlan.warnings);
  }

  let ambienceCues = [];
  if (ambiencePreset != null) {
    const ambiencePlan = buildSoundscapePresetCues(ambiencePreset, assets);
    if (ambiencePlan.missingAssets.length > 0) {
      throw new Error("Required ambience asset is not available: " + ambiencePlan.missingAssets.join(", "));
    }
    ambienceCues = ambiencePlan.cues.map(toRendererCue);
  }

  const foleyCues = foleyPlan?.cues ?? [];
  const cues = [...ambienceCues, ...foleyCues];
  const renderedRequest = Object.freeze({
    text: renderedText,
    raw_tags: hasVocalTags,
    pauses: Object.freeze(pauses.map(({ after_text, occurrence, duration_ms }) => Object.freeze({
      after_text,
      occurrence,
      duration_ms,
    }))),
    cues: Object.freeze(cues),
    sequence_foley: foleyCues.length > 0,
    tail_duration_sec: tailDurationSec,
    save_recording: false,
  });

  return Object.freeze({
    plan_only: true,
    estimated_tts_calls: 0,
    render_tool: "render_continuous_audio_timeline",
    text,
    rendered_text: renderedText,
    raw_tags: hasVocalTags,
    beat_count: beatPlans.length,
    beats: Object.freeze(beatPlans),
    pauses: Object.freeze(pauses),
    pause_total_ms: pauseTotalMs,
    foley_action_count: foleyCues.length,
    foley_action_labels: Object.freeze(foleyPlan?.action_labels ?? []),
    ambience_preset: ambiencePreset ?? null,
    ambience_cue_count: ambienceCues.length,
    tail_duration_sec: tailDurationSec,
    cues: Object.freeze(cues),
    sequence_foley: foleyCues.length > 0,
    warnings: Object.freeze(warnings),
    render_request: renderedRequest,
    notes: Object.freeze([
      "This is a deterministic planning tool; it makes no ElevenLabs request and consumes no TTS credits.",
      "Beat text must concatenate exactly to the original scene text; untagged beats remain natural.",
      "Vocal presets are applied only to exact anchors explicitly supplied for each beat.",
      "Pauses are inserted after exact aligned phrases during the single continuous render; later text-anchored Foley cues move with the inserted silence.",
      "Physical actions are never inferred from keywords; each selected Foley action maps to one uploaded asset.",
      "Ambience is optional and uses only the selected uploaded rain or desk asset.",
      "Afterglow remains an arrangement preset with an untagged closing beat, not a standalone TTS tag.",
    ]),
  });
}

/**
 * Resolve exact phrase anchors against provider alignment before editing PCM.
 */
export function resolveScenePauses({
  alignment,
  normalizedAlignment,
  expectedText,
  pauses = [],
  voiceDurationSec,
} = {}) {
  if (!Array.isArray(pauses) || pauses.length > MAX_BEATS) {
    throw new Error("pauses must contain no more than 12 aligned pause requests");
  }
  if (!Number.isFinite(voiceDurationSec) || voiceDurationSec <= 0) {
    throw new Error("voiceDurationSec must be a positive finite number");
  }

  let previousAtSec = -1;
  let totalMs = 0;
  const resolved = pauses.map((pause, index) => {
    if (!pause || typeof pause !== "object" || Array.isArray(pause)) {
      throw new Error("Pause " + (index + 1) + " must be an object");
    }
    if (!Number.isInteger(pause.duration_ms) || pause.duration_ms < 80 || pause.duration_ms > 3000) {
      throw new Error("Pause " + (index + 1) + " duration_ms must be an integer between 80 and 3000");
    }
    const atSec = resolveCueTimeAfterText({
      alignment,
      normalizedAlignment,
      expectedText,
      afterText: pause.after_text,
      occurrence: pause.occurrence ?? 1,
    });
    if (atSec + 0.001 < previousAtSec || atSec > voiceDurationSec + 0.02) {
      throw new Error("Aligned scene pauses must be in spoken-text order and within the voice duration");
    }
    if (atSec - previousAtSec < 0.001 && previousAtSec >= 0) {
      throw new Error("Scene pause anchors must resolve to distinct aligned positions");
    }
    previousAtSec = atSec;
    totalMs += pause.duration_ms;
    if (totalMs > MAX_PAUSE_TOTAL_MS) {
      throw new Error("Total inserted scene pauses cannot exceed 10000 ms");
    }
    return Object.freeze({
      after_text: pause.after_text,
      occurrence: pause.occurrence ?? 1,
      atSec,
      requestedDurationMs: pause.duration_ms,
      durationSec: pause.duration_ms / 1000,
    });
  });
  return Object.freeze(resolved);
}

/**
 * Insert actual zero-valued PCM frames without changing any speech samples.
 */
export function insertTimelinePauses(voicePcm, pauses = [], { maxDurationSec = 60 } = {}) {
  if (!voicePcm || !Array.isArray(voicePcm.channels) || !voicePcm.channels.length ||
      !Number.isInteger(voicePcm.sampleRate) || voicePcm.sampleRate <= 0) {
    throw new Error("voicePcm must contain channels and a valid sampleRate");
  }
  if (!Array.isArray(pauses) || pauses.length > MAX_BEATS) {
    throw new Error("pauses must be an array with no more than 12 entries");
  }
  if (!Number.isFinite(maxDurationSec) || maxDurationSec <= 0) {
    throw new Error("maxDurationSec must be a positive finite number");
  }

  const frameCount = voicePcm.channels[0].length;
  if (!frameCount || !voicePcm.channels.every((channel) => channel.length === frameCount)) {
    throw new Error("voicePcm channels must have the same non-zero frame count");
  }
  if (!pauses.length) {
    return Object.freeze({ voicePcm, pauses: Object.freeze([]), insertedDurationSec: 0 });
  }

  const sorted = pauses.map((pause) => ({ ...pause }))
    .sort((a, b) => a.atSec - b.atSec);
  let previousFrame = -1;
  let totalInsertedFrames = 0;
  const prepared = sorted.map((pause, index) => {
    if (!Number.isFinite(pause.atSec) || pause.atSec < 0 ||
        !Number.isFinite(pause.durationSec) || pause.durationSec <= 0) {
      throw new Error("Pause " + (index + 1) + " has invalid aligned timing");
    }
    const frame = Math.round(pause.atSec * voicePcm.sampleRate);
    const insertFrames = Math.round(pause.durationSec * voicePcm.sampleRate);
    if (frame < previousFrame || frame > frameCount || insertFrames < 1) {
      throw new Error("Pause " + (index + 1) + " is outside the voice or overlaps an earlier pause");
    }
    if (frame === previousFrame) {
      throw new Error("Scene pauses must resolve to distinct PCM frame positions");
    }
    previousFrame = frame;
    totalInsertedFrames += insertFrames;
    return { ...pause, frame, insertFrames, actualDurationSec: insertFrames / voicePcm.sampleRate };
  });

  const outputFrames = frameCount + totalInsertedFrames;
  const outputDurationSec = outputFrames / voicePcm.sampleRate;
  if (outputDurationSec > maxDurationSec + 0.001) {
    throw new Error("Inserted scene pauses would exceed the maximum timeline duration");
  }

  const outputChannels = voicePcm.channels.map((source) => {
    const output = new Float32Array(outputFrames);
    let sourceOffset = 0;
    let targetOffset = 0;
    for (const pause of prepared) {
      const segmentFrames = pause.frame - sourceOffset;
      output.set(source.subarray(sourceOffset, pause.frame), targetOffset);
      sourceOffset = pause.frame;
      targetOffset += segmentFrames + pause.insertFrames;
    }
    output.set(source.subarray(sourceOffset), targetOffset);
    return output;
  });

  const resolvedPauses = prepared.map((pause) => Object.freeze({
    after_text: pause.after_text,
    occurrence: pause.occurrence,
    atSec: pause.atSec,
    durationSec: pause.actualDurationSec,
    durationMs: Math.round(pause.actualDurationSec * 1000),
    inserted_frames: pause.insertFrames,
  }));

  return Object.freeze({
    voicePcm: Object.freeze({
      ...voicePcm,
      channels: Object.freeze(outputChannels),
      frameCount: outputFrames,
      durationSec: outputDurationSec,
    }),
    pauses: Object.freeze(resolvedPauses),
    insertedDurationSec: totalInsertedFrames / voicePcm.sampleRate,
  });
}

/**
 * A text-anchored Foley cue at the same phrase starts during its pause.
 * Only cues after an earlier pause are shifted along the extended timeline.
 */
export function shiftCueTimeForPauses(atSec, pauses = []) {
  if (!Number.isFinite(atSec) || atSec < 0 || !Array.isArray(pauses)) {
    throw new Error("Cue time and pauses must be valid");
  }
  const added = pauses.reduce((sum, pause) =>
    pause.atSec < atSec - 0.000001 ? sum + pause.durationSec : sum, 0);
  return atSec + added;
}
