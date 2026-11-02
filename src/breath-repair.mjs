import { repositionOpeningBreaths } from "./breath-engine.mjs";

function validateInput(samples, sampleRate, analysis) {
  if (!(samples instanceof Float32Array) || samples.length === 0) {
    throw new Error("samples must be a non-empty Float32Array");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("sampleRate must be an integer between 8000 and 96000 Hz");
  }
  if (!analysis || analysis.sampleRate !== sampleRate ||
      analysis.sampleCount !== samples.length ||
      !Array.isArray(analysis.breaths) || !Array.isArray(analysis.islands)) {
    throw new Error("analysis must be produced from the same samples and sample rate");
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function measureRiseTimeMs(samples, start, end, sampleRate) {
  const windowSize = Math.max(1, Math.round(sampleRate * 0.005));
  const peaks = [];
  let peak = 0;

  for (let offset = start; offset < end; offset += windowSize) {
    let localPeak = 0;
    const limit = Math.min(end, offset + windowSize);
    for (let i = offset; i < limit; i += 1) {
      localPeak = Math.max(localPeak, Math.abs(samples[i]));
    }
    peaks.push(localPeak);
    peak = Math.max(peak, localPeak);
  }

  if (peak <= 1e-7 || peaks.length < 2) return null;
  const threshold10 = peak * 0.1;
  const threshold90 = peak * 0.9;
  const first10 = peaks.findIndex((value) => value >= threshold10);
  const first90 = peaks.findIndex((value) => value >= threshold90);
  if (first10 < 0 || first90 < 0 || first90 < first10) return null;
  return ((first90 - first10) * windowSize / sampleRate) * 1000;
}

/**
 * Repair only already-present, high-confidence non-verbal breath islands.
 * Speech samples are never gain-adjusted or time-stretched. The optional
 * repositioning step moves a qualifying opening inhale together with nearby
 * silence, preserving the original timeline duration.
 */
export function repairBreathSegments({
  samples,
  sampleRate,
  analysis,
  minConfidence = 0.5,
  targetRelativeSpeechDb = -12,
  maxAttenuationDb = 12,
  onsetThresholdMs = 90,
  fadeInMinMs = 60,
  fadeInMaxMs = 150,
  inhaleFadeOutMs = 35,
  exhaleFadeInMs = 30,
  targetLeadSec = 0.08,
  minPreviousSilenceSec = 0.3,
  maxNextSpeechGapSec = 1.5,
} = {}) {
  validateInput(samples, sampleRate, analysis);

  for (const [name, value, min, max] of [
    ["minConfidence", minConfidence, 0, 1],
    ["targetRelativeSpeechDb", targetRelativeSpeechDb, -60, 0],
    ["maxAttenuationDb", maxAttenuationDb, 0, 24],
    ["onsetThresholdMs", onsetThresholdMs, 0, 1000],
    ["fadeInMinMs", fadeInMinMs, 0, 500],
    ["fadeInMaxMs", fadeInMaxMs, fadeInMinMs, 1000],
    ["inhaleFadeOutMs", inhaleFadeOutMs, 0, 500],
    ["exhaleFadeInMs", exhaleFadeInMs, 0, 500],
    ["targetLeadSec", targetLeadSec, 0, 2],
    ["minPreviousSilenceSec", minPreviousSilenceSec, 0, 2],
    ["maxNextSpeechGapSec", maxNextSpeechGapSec, 0, 2],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(name + " must be between " + min + " and " + max);
    }
  }

  const output = new Float32Array(samples);
  const candidates = analysis.breaths.filter((breath) =>
    breath.accepted === true &&
    breath.confidence >= minConfidence &&
    (breath.breathType === "inhale" || breath.breathType === "exhale")
  );

  let attenuatedCount = 0;
  let smoothedCount = 0;
  let fadeOutCount = 0;

  for (const breath of candidates) {
    const start = clamp(Math.floor(breath.startSample), 0, output.length);
    const end = clamp(Math.ceil(breath.endSample), start, output.length);
    const length = end - start;
    if (length < 2) continue;

    let gain = 1;
    if (Number.isFinite(breath.relativeSpeechDb) &&
        breath.relativeSpeechDb > targetRelativeSpeechDb) {
      const attenuationDb = Math.max(
        -maxAttenuationDb,
        targetRelativeSpeechDb - breath.relativeSpeechDb
      );
      gain = Math.pow(10, attenuationDb / 20);
      if (gain < 0.999) attenuatedCount += 1;
    }

    const durationMs = length / sampleRate * 1000;
    const riseTimeMs = measureRiseTimeMs(output, start, end, sampleRate);
    let fadeInMs = 0;
    if (breath.breathType === "exhale") {
      fadeInMs = exhaleFadeInMs;
    } else if (riseTimeMs != null && riseTimeMs < onsetThresholdMs) {
      fadeInMs = clamp(durationMs * 0.25, fadeInMinMs, fadeInMaxMs);
    }
    let fadeInSamples = Math.min(
      Math.round(sampleRate * fadeInMs / 1000),
      Math.floor(length / 2)
    );
    if (fadeInSamples > 0) smoothedCount += 1;

    const fadeOutMsForBreath = breath.breathType === "inhale" ? inhaleFadeOutMs : 0;
    const fadeOutSamples = Math.min(
      Math.round(sampleRate * fadeOutMsForBreath / 1000),
      Math.floor(length / 2)
    );
    if (fadeOutSamples > 0) fadeOutCount += 1;
    if (fadeInSamples + fadeOutSamples > length) {
      fadeInSamples = Math.max(0, length - fadeOutSamples);
    }

    for (let i = 0; i < length; i += 1) {
      let envelope = 1;
      if (fadeInSamples > 0 && i < fadeInSamples) {
        const progress = (i + 1) / fadeInSamples;
        envelope *= 0.5 - 0.5 * Math.cos(Math.PI * progress);
      }
      if (fadeOutSamples > 0 && i >= length - fadeOutSamples) {
        const progress = (length - i) / fadeOutSamples;
        envelope *= 0.5 - 0.5 * Math.cos(Math.PI * progress);
      }
      output[start + i] *= gain * envelope;
    }
  }

  const repositioned = repositionOpeningBreaths({
    samples: output,
    sampleRate,
    analysis,
    targetLeadSec,
    minPreviousSilenceSec,
    maxNextSpeechGapSec,
  });

  let speechSamplesPreserved = true;
  for (const island of analysis.islands) {
    if (island.kind !== "speech") continue;
    const start = clamp(Math.floor(island.startSample), 0, samples.length);
    const end = clamp(Math.ceil(island.endSample), start, samples.length);
    for (let i = start; i < end; i += 1) {
      if (repositioned.samples[i] !== samples[i]) {
        speechSamplesPreserved = false;
        break;
      }
    }
    if (!speechSamplesPreserved) break;
  }

  return Object.freeze({
    samples: repositioned.samples,
    candidateCount: candidates.length,
    attenuatedCount,
    smoothedCount,
    fadeOutCount,
    repositionedCount: repositioned.adjustments.length,
    adjustments: repositioned.adjustments,
    durationPreserved: repositioned.durationPreserved &&
      repositioned.samples.length === samples.length,
    speechSamplesPreserved,
  });
}
