const DEFAULTS = Object.freeze({
  frameMs: 10,
  silenceThresholdDb: -48,
  mergeSilenceSec: 0.08,
  minGapSec: 0.72,
  edgeMarginSec: 0.05,
  inhaleLeadSec: 0.06,
  gain: 0.28,
  normalizationTargetRms: 0.06,
  maxClipSec: 1.1,
});

function assertNumber(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(name + " must be a finite number between " + min + " and " + max);
  }
}

function getPcmShape(pcm) {
  if (!pcm || !Array.isArray(pcm.channels) || !pcm.channels.length ||
      !pcm.channels.every((channel) => channel && typeof channel.length === "number")) {
    throw new Error("pcm must contain one or more decoded audio channels");
  }
  const sampleRate = Number(pcm.sampleRate);
  const frameCount = pcm.channels[0].length;
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 ||
      !Number.isInteger(frameCount) || frameCount < 1 ||
      !pcm.channels.every((channel) => channel.length === frameCount)) {
    throw new Error("pcm sample rate and channel lengths are invalid");
  }
  return { sampleRate, frameCount, channels: pcm.channels };
}

/**
 * Find only internal low-energy windows between speech-like regions.
 * This is deliberately conservative: leading/trailing silence is ignored,
 * and short gaps are merged into their surrounding active regions.
 */
export function detectSpeechGaps(pcm, options = {}) {
  const { sampleRate, frameCount, channels } = getPcmShape(pcm);
  const frameMs = options.frameMs ?? DEFAULTS.frameMs;
  const silenceThresholdDb = options.silenceThresholdDb ?? DEFAULTS.silenceThresholdDb;
  const mergeSilenceSec = options.mergeSilenceSec ?? DEFAULTS.mergeSilenceSec;
  const minGapSec = options.minGapSec ?? DEFAULTS.minGapSec;
  assertNumber(frameMs, "frameMs", 5, 50);
  assertNumber(silenceThresholdDb, "silenceThresholdDb", -90, -20);
  assertNumber(mergeSilenceSec, "mergeSilenceSec", 0, 0.5);
  assertNumber(minGapSec, "minGapSec", 0.2, 5);

  const frameSize = Math.max(1, Math.round(sampleRate * frameMs / 1000));
  const frameCountTotal = Math.ceil(frameCount / frameSize);
  const threshold = 10 ** (silenceThresholdDb / 20);
  const active = new Uint8Array(frameCountTotal);

  for (let frame = 0; frame < frameCountTotal; frame += 1) {
    const start = frame * frameSize;
    const end = Math.min(frameCount, start + frameSize);
    let sumSquares = 0;
    let sampleCount = 0;
    for (const channel of channels) {
      for (let i = start; i < end; i += 1) {
        const sample = Number(channel[i]) || 0;
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }
    const rms = sampleCount ? Math.sqrt(sumSquares / sampleCount) : 0;
    active[frame] = rms >= threshold ? 1 : 0;
  }

  const activeRanges = [];
  let runStart = -1;
  for (let frame = 0; frame <= frameCountTotal; frame += 1) {
    const isActive = frame < frameCountTotal && active[frame] === 1;
    if (isActive && runStart < 0) runStart = frame;
    if (!isActive && runStart >= 0) {
      activeRanges.push({ startFrame: runStart, endFrame: frame });
      runStart = -1;
    }
  }

  const mergeFrames = Math.floor(mergeSilenceSec * sampleRate / frameSize);
  const mergedRanges = [];
  for (const range of activeRanges) {
    const previous = mergedRanges.at(-1);
    if (previous && range.startFrame - previous.endFrame <= mergeFrames) {
      previous.endFrame = range.endFrame;
    } else {
      mergedRanges.push({ ...range });
    }
  }

  const gaps = [];
  for (let index = 0; index < mergedRanges.length - 1; index += 1) {
    const previous = mergedRanges[index];
    const next = mergedRanges[index + 1];
    const startSec = previous.endFrame * frameSize / sampleRate;
    const endSec = next.startFrame * frameSize / sampleRate;
    const durationSec = endSec - startSec;
    if (durationSec + 1e-9 >= minGapSec) {
      gaps.push(Object.freeze({
        index,
        startSec: Number(startSec.toFixed(4)),
        endSec: Number(endSec.toFixed(4)),
        durationSec: Number(durationSec.toFixed(4)),
      }));
    }
  }

  return Object.freeze(gaps);
}

function pickAsset(assets, breathType, maxDurationSec, cursors) {
  const candidates = assets
    .filter((asset) => asset.kind === "breath" && asset.breathType === breathType &&
      Number.isFinite(asset.durationSec) && asset.durationSec >= 0.12 &&
      asset.durationSec <= DEFAULTS.maxClipSec && asset.durationSec <= maxDurationSec)
    .sort((a, b) => a.durationSec - b.durationSec || String(a.id).localeCompare(String(b.id)));
  if (!candidates.length) return null;
  const cursor = cursors[breathType] || 0;
  cursors[breathType] = cursor + 1;
  return candidates[cursor % candidates.length];
}

function overlapsCue(startSec, endSec, cues) {
  return cues.some((cue) => {
    const cueStart = Number(cue.atSec ?? cue.at_sec);
    const cueDuration = Number(cue.durationSec ?? cue.duration_sec);
    if (!Number.isFinite(cueStart) || !Number.isFinite(cueDuration) || cueDuration <= 0) return false;
    const cueEnd = cueStart + cueDuration;
    return startSec < cueEnd - 0.01 && endSec > cueStart + 0.01;
  });
}

/**
 * Plan optional breath overlays in detected silence. The returned cues never
 * alter or move voice samples and are constrained to the silent windows.
 */
export function planBreathCues({
  pcm,
  assets = [],
  occupiedCues = [],
  maxBreaths = 4,
  minGapSec = DEFAULTS.minGapSec,
  silenceThresholdDb = -48,
  gain = DEFAULTS.gain,
  normalizationTargetRms = DEFAULTS.normalizationTargetRms,
} = {}) {
  if (!Array.isArray(assets)) throw new Error("assets must be an array");
  if (!Array.isArray(occupiedCues)) throw new Error("occupiedCues must be an array");
  if (!Number.isInteger(maxBreaths) || maxBreaths < 1 || maxBreaths > 6) {
    throw new Error("maxBreaths must be an integer between 1 and 6");
  }
  assertNumber(minGapSec, "minGapSec", 0.2, 5);
  assertNumber(gain, "gain", 0, 0.35);
  assertNumber(normalizationTargetRms, "normalizationTargetRms", 0.01, 0.12);

  const usableAssets = assets.filter((asset) =>
    asset && typeof asset.id === "string" && asset.id.length > 0 &&
    asset.kind === "breath" && ["inhale", "exhale"].includes(asset.breathType));
  if (!usableAssets.length) {
    throw new Error("Breath engine needs at least one uploaded breath asset classified as inhale or exhale");
  }

  const gaps = detectSpeechGaps(pcm, { minGapSec, silenceThresholdDb });
  const cursors = { inhale: 0, exhale: 0 };
  const cues = [];
  const skipped = [];
  const edgeMarginSec = DEFAULTS.edgeMarginSec;
  const inhaleLeadSec = DEFAULTS.inhaleLeadSec;

  function addCue(asset, atSec) {
    const durationSec = asset.durationSec;
    const endSec = atSec + durationSec;
    if (overlapsCue(atSec, endSec, [...occupiedCues, ...cues])) return false;
    cues.push(Object.freeze({
      fileId: asset.id,
      kind: "breath",
      breathType: asset.breathType,
      atSec: Number(atSec.toFixed(4)),
      durationSec: Number(durationSec.toFixed(4)),
      gain,
      pan: 0,
      distanceMeters: 1.5,
      sourceOffsetSec: 0,
      normalizationTargetRms,
      fadeInSec: Math.min(0.025, durationSec / 4),
      fadeOutSec: Math.min(0.045, durationSec / 4),
      loop: false,
    }));
    return true;
  }

  for (let index = 0; index < gaps.length && cues.length < maxBreaths; index += 1) {
    const gap = gaps[index];
    const usableWindowSec = gap.durationSec - edgeMarginSec - inhaleLeadSec;
    if (usableWindowSec <= 0.12) {
      skipped.push({ gap_index: gap.index, reason: "gap too short after safety margins" });
      continue;
    }

    const exhale = pickAsset(usableAssets, "exhale", usableWindowSec, cursors);
    const inhale = pickAsset(usableAssets, "inhale", usableWindowSec, cursors);
    const bothFit = exhale && inhale &&
      exhale.durationSec + inhale.durationSec + edgeMarginSec + inhaleLeadSec <= gap.durationSec;

    if (bothFit && cues.length + 2 <= maxBreaths) {
      const exhaleAt = gap.startSec + edgeMarginSec;
      const inhaleAt = gap.endSec - inhaleLeadSec - inhale.durationSec;
      const firstAdded = addCue(exhale, exhaleAt);
      const secondAdded = addCue(inhale, inhaleAt);
      if (!firstAdded || !secondAdded) {
        if (!firstAdded) skipped.push({ gap_index: gap.index, reason: "exhale overlaps an existing cue" });
        if (!secondAdded) skipped.push({ gap_index: gap.index, reason: "inhale overlaps an existing cue" });
      }
      continue;
    }

    const preferredType = index % 2 === 0 ? "inhale" : "exhale";
    const preferred = preferredType === "inhale" ? inhale : exhale;
    const fallback = preferredType === "inhale" ? exhale : inhale;
    const selected = preferred || fallback;
    if (!selected) {
      skipped.push({ gap_index: gap.index, reason: "no breath sample short enough for this gap" });
      continue;
    }
    const atSec = selected.breathType === "inhale"
      ? gap.endSec - inhaleLeadSec - selected.durationSec
      : gap.startSec + edgeMarginSec;
    if (!addCue(selected, atSec)) {
      skipped.push({ gap_index: gap.index, reason: "breath placement overlaps an existing cue" });
    }
  }

  return Object.freeze({
    cues: Object.freeze(cues),
    report: Object.freeze({
      enabled: true,
      algorithm: "silence-window-v1",
      detected_gap_count: gaps.length,
      cues_added: cues.length,
      skipped_gap_count: skipped.length,
      max_breaths: maxBreaths,
      min_gap_sec: minGapSec,
      silence_threshold_db: silenceThresholdDb,
      cues: Object.freeze(cues.map((cue) => Object.freeze({
        asset_id: cue.fileId,
        breath_type: cue.breathType,
        at_sec: cue.atSec,
        duration_sec: cue.durationSec,
      }))),
      skipped: Object.freeze(skipped.map((item) => Object.freeze(item))),
      voice_samples_modified: false,
      extra_tts_calls: 0,
    }),
  });
}
