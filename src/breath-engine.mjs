function validateSamples(samples, sampleRate) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error("samples must be a non-empty Float32Array");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("sampleRate must be an integer between 8000 and 96000 Hz");
  }
}

function mean(values, start, end) {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += values[i];
  return sum / (end - start);
}

function estimatePeriodicity(samples, centerSample, sampleRate) {
  const decimation = Math.max(1, Math.round(sampleRate / 6000));
  const effectiveRate = sampleRate / decimation;
  const windowLength = Math.max(48, Math.round(effectiveRate * 0.025));
  const center = Math.floor(centerSample / decimation);
  const half = Math.floor(windowLength / 2);
  const decimatedLength = Math.ceil(samples.length / decimation);
  const start = Math.max(0, Math.min(decimatedLength - windowLength, center - half));
  if (start < 0 || decimatedLength < windowLength) return 0;

  const window = new Float64Array(windowLength);
  let average = 0;
  for (let i = 0; i < windowLength; i += 1) {
    const value = samples[(start + i) * decimation] || 0;
    window[i] = value;
    average += value;
  }
  average /= windowLength;

  let totalEnergy = 0;
  for (let i = 0; i < windowLength; i += 1) {
    window[i] -= average;
    totalEnergy += window[i] * window[i];
  }
  if (totalEnergy < 1e-8) return 0;

  const minLag = Math.max(2, Math.floor(effectiveRate / 400));
  const maxLag = Math.min(Math.ceil(effectiveRate / 70), Math.floor(windowLength / 2));
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let leftEnergy = 0;
    let rightEnergy = 0;
    const limit = windowLength - lag;
    for (let i = 0; i < limit; i += 1) {
      const left = window[i];
      const right = window[i + lag];
      correlation += left * right;
      leftEnergy += left * left;
      rightEnergy += right * right;
    }
    const denominator = Math.sqrt(leftEnergy * rightEnergy);
    if (denominator > 1e-9) best = Math.max(best, correlation / denominator);
  }
  return Math.max(0, Math.min(1, best));
}

function classifyEnvelope(frameRms) {
  if (!frameRms.length) return "uncertain";
  const width = Math.max(1, Math.floor(frameRms.length * 0.4));
  const start = mean(frameRms, 0, width);
  const end = mean(frameRms, frameRms.length - width, frameRms.length);
  if (start < 1e-6 || end < 1e-6) return "uncertain";
  const ratio = end / start;
  if (ratio >= 1.25) return "inhale";
  if (ratio <= 0.8) return "exhale";
  return "uncertain";
}

function dbFromRms(rms) {
  return rms > 1e-9 ? 20 * Math.log10(rms) : -180;
}

/**
 * Analyze mono PCM into conservative speech/breath candidates.
 * This is a diagnostic-only pass: it never changes audio and never calls TTS.
 */
export function analyzeBreathSegments({
  samples,
  sampleRate,
  frameMs = 10,
  activityThresholdRms = 0.0025,
  mergeGapSec = 0.04,
  minBreathSec = 0.12,
  maxBreathSec = 1.3,
  maxVoicedRatio = 0.15,
  minSpeechVoicedRatio = 0.25,
  maxSpeechDistanceSec = 1.5,
  minRelativeSpeechDb = -4,
  periodicityThreshold = 0.45,
} = {}) {
  validateSamples(samples, sampleRate);
  if (!Number.isFinite(frameMs) || frameMs < 5 || frameMs > 40) {
    throw new Error("frameMs must be between 5 and 40 ms");
  }
  if (!Number.isFinite(activityThresholdRms) || activityThresholdRms <= 0 || activityThresholdRms >= 1) {
    throw new Error("activityThresholdRms must be between 0 and 1");
  }
  if (!Number.isFinite(mergeGapSec) || mergeGapSec < 0 || mergeGapSec > 0.3) {
    throw new Error("mergeGapSec must be between 0 and 0.3 seconds");
  }
  for (const [name, value, min, max] of [
    ["minBreathSec", minBreathSec, 0.05, 3],
    ["maxBreathSec", maxBreathSec, minBreathSec, 5],
    ["maxVoicedRatio", maxVoicedRatio, 0, 1],
    ["minSpeechVoicedRatio", minSpeechVoicedRatio, 0, 1],
    ["maxSpeechDistanceSec", maxSpeechDistanceSec, 0.1, 10],
    ["minRelativeSpeechDb", minRelativeSpeechDb, -60, 0],
    ["periodicityThreshold", periodicityThreshold, 0, 1],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(name + " must be between " + min + " and " + max);
    }
  }

  const frameSize = Math.max(1, Math.round(sampleRate * frameMs / 1000));
  const frameCount = Math.ceil(samples.length / frameSize);
  const frames = new Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const startSample = frame * frameSize;
    const endSample = Math.min(samples.length, startSample + frameSize);
    let sumSquares = 0;
    for (let i = startSample; i < endSample; i += 1) sumSquares += samples[i] * samples[i];
    const rms = Math.sqrt(sumSquares / Math.max(1, endSample - startSample));
    const periodicity = rms >= activityThresholdRms
      ? estimatePeriodicity(samples, Math.floor((startSample + endSample) / 2), sampleRate)
      : 0;
    frames[frame] = {
      startSample,
      endSample,
      rms,
      active: rms >= activityThresholdRms,
      periodicity,
      voiced: periodicity >= periodicityThreshold,
    };
  }

  const mergeGapFrames = Math.floor(mergeGapSec / (frameMs / 1000));
  const ranges = [];
  let startFrame = -1;
  let lastActiveFrame = -1;
  for (let i = 0; i < frames.length; i += 1) {
    if (frames[i].active) {
      if (startFrame < 0) startFrame = i;
      lastActiveFrame = i;
    } else if (startFrame >= 0 && i - lastActiveFrame - 1 > mergeGapFrames) {
      ranges.push([startFrame, lastActiveFrame + 1]);
      startFrame = -1;
      lastActiveFrame = -1;
    }
  }
  if (startFrame >= 0) ranges.push([startFrame, lastActiveFrame + 1]);

  const islands = ranges.map(([first, afterLast], index) => {
    const activeFrames = frames.slice(first, afterLast).filter((frame) => frame.active);
    const rms = Math.sqrt(mean(activeFrames.map((frame) => frame.rms ** 2), 0, activeFrames.length));
    const voicedRatio = activeFrames.length
      ? activeFrames.filter((frame) => frame.voiced).length / activeFrames.length
      : 0;
    const startSample = frames[first].startSample;
    const endSample = frames[afterLast - 1].endSample;
    return {
      index,
      startSample,
      endSample,
      startSec: startSample / sampleRate,
      endSec: endSample / sampleRate,
      durationSec: (endSample - startSample) / sampleRate,
      rms,
      rmsDb: dbFromRms(rms),
      voicedRatio,
      kind: voicedRatio >= minSpeechVoicedRatio ? "speech" : "unvoiced",
      frameRms: activeFrames.map((frame) => frame.rms),
    };
  });

  const speechIslands = islands.filter((island) => island.kind === "speech");
  const breaths = [];
  for (const island of islands) {
    if (island.kind !== "unvoiced" || island.durationSec < minBreathSec || island.durationSec > maxBreathSec) continue;
    const previousSpeech = speechIslands.filter((speech) => speech.endSample <= island.startSample).at(-1) || null;
    const nextSpeech = speechIslands.find((speech) => speech.startSample >= island.endSample) || null;
    const previousGapSec = previousSpeech ? (island.startSample - previousSpeech.endSample) / sampleRate : null;
    const nextGapSec = nextSpeech ? (nextSpeech.startSample - island.endSample) / sampleRate : null;
    const breathType = classifyEnvelope(island.frameRms);
    const adjacentSpeech = breathType === "inhale" ? nextSpeech
      : breathType === "exhale" ? previousSpeech
        : (!previousSpeech ? nextSpeech : !nextSpeech ? previousSpeech
          : (previousGapSec <= nextGapSec ? previousSpeech : nextSpeech));
    const distanceSec = adjacentSpeech
      ? (adjacentSpeech.startSample >= island.endSample
        ? (adjacentSpeech.startSample - island.endSample) / sampleRate
        : (island.startSample - adjacentSpeech.endSample) / sampleRate)
      : Infinity;
    const relativeSpeechDb = adjacentSpeech ? island.rmsDb - adjacentSpeech.rmsDb : null;
    const reasons = [];
    if (!adjacentSpeech || distanceSec > maxSpeechDistanceSec) reasons.push("no nearby voiced speech");
    if (relativeSpeechDb == null || relativeSpeechDb > minRelativeSpeechDb) reasons.push("not sufficiently quieter than adjacent speech");
    if (island.voicedRatio > maxVoicedRatio) reasons.push("too much periodic/voiced content");
    const accepted = reasons.length === 0;
    const confidence = accepted
      ? Math.max(0, Math.min(1,
        0.45 * (1 - island.voicedRatio / Math.max(maxVoicedRatio, 0.01)) +
        0.35 * Math.min(1, Math.abs(relativeSpeechDb) / 18) +
        0.2 * Math.max(0, 1 - distanceSec / maxSpeechDistanceSec)))
      : 0;
    breaths.push(Object.freeze({
      ...island,
      frameRms: undefined,
      breathType,
      previousSpeechEndSample: previousSpeech?.endSample ?? null,
      nextSpeechStartSample: nextSpeech?.startSample ?? null,
      previousGapSec,
      nextGapSec,
      adjacentSpeechRmsDb: adjacentSpeech?.rmsDb ?? null,
      relativeSpeechDb,
      distanceSec,
      accepted,
      confidence,
      reasons: Object.freeze(reasons),
    }));
  }

  return Object.freeze({
    sampleRate,
    sampleCount: samples.length,
    durationSec: samples.length / sampleRate,
    frameMs,
    islands: Object.freeze(islands.map((island) => Object.freeze({ ...island, frameRms: undefined }))),
    breaths: Object.freeze(breaths),
  });
}

/**
 * Move only a clearly identified pre-speech inhale closer to the next phrase.
 * The operation swaps silence around the breath, preserving total duration
 * and every sample at/after the following speech onset.
 */
export function repositionOpeningBreaths({
  samples,
  sampleRate,
  analysis,
  targetLeadSec = 0.08,
  minPreviousSilenceSec = 0.3,
  maxNextSpeechGapSec = 1.5,
  preRollSec = 0.02,
  postRollSec = 0.03,
} = {}) {
  validateSamples(samples, sampleRate);
  if (!analysis || analysis.sampleRate !== sampleRate || analysis.sampleCount !== samples.length || !Array.isArray(analysis.breaths)) {
    throw new Error("analysis must be produced from the same samples and sample rate");
  }
  for (const [name, value] of Object.entries({ targetLeadSec, minPreviousSilenceSec, maxNextSpeechGapSec, preRollSec, postRollSec })) {
    if (!Number.isFinite(value) || value < 0 || value > 2) throw new Error(name + " must be between 0 and 2 seconds");
  }

  const candidates = analysis.breaths
    .filter((breath) => breath.accepted && breath.breathType === "inhale" && breath.nextSpeechStartSample != null)
    .sort((a, b) => b.startSample - a.startSample);
  let output = new Float32Array(samples);
  const adjustments = [];

  for (const breath of candidates) {
    const previousSilenceSec = breath.previousSpeechEndSample == null
      ? breath.startSec
      : (breath.startSample - breath.previousSpeechEndSample) / sampleRate;
    const gapAfterSec = (breath.nextSpeechStartSample - breath.endSample) / sampleRate;
    if (previousSilenceSec < minPreviousSilenceSec || gapAfterSec <= targetLeadSec + postRollSec || gapAfterSec > maxNextSpeechGapSec) {
      continue;
    }

    const hasInterveningIsland = analysis.islands.some((island) =>
      island.startSample >= breath.endSample && island.endSample <= breath.nextSpeechStartSample
    );
    if (hasInterveningIsland) continue;

    const moveStart = Math.max(0, breath.startSample - Math.round(preRollSec * sampleRate));
    const moveEnd = Math.min(samples.length, breath.endSample + Math.round(postRollSec * sampleRate));
    const blockLength = moveEnd - moveStart;
    const actualBreathLeadSec = Math.max(0, targetLeadSec - postRollSec);
    const targetBlockEnd = breath.nextSpeechStartSample - Math.round(actualBreathLeadSec * sampleRate);
    const targetBlockStart = targetBlockEnd - blockLength;
    if (targetBlockStart <= moveEnd || targetBlockStart <= moveStart || targetBlockEnd >= breath.nextSpeechStartSample) continue;

    const next = new Float32Array(output.length);
    next.set(output.subarray(0, moveStart), 0);
    next.set(output.subarray(moveEnd, targetBlockEnd), moveStart);
    next.set(output.subarray(moveStart, moveEnd), targetBlockStart);
    next.set(output.subarray(targetBlockEnd), targetBlockEnd);
    output = next;
    adjustments.push(Object.freeze({
      fromStartSec: moveStart / sampleRate,
      toStartSec: targetBlockStart / sampleRate,
      durationSec: blockLength / sampleRate,
      speechStartSec: breath.nextSpeechStartSample / sampleRate,
      targetLeadSec,
    }));
  }

  return Object.freeze({
    samples: output,
    adjustments: Object.freeze(adjustments),
    durationPreserved: output.length === samples.length,
    speechSamplesPreserved: true,
  });
}
