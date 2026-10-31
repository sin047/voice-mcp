const MAX_CUES = 12;
const MAX_SECONDS = 180;
const EFFECT_KINDS = new Set(["ambience", "foley"]);
const SPATIAL_MODES = new Set(["stereo", "hrtf"]);

function boundedNumber(value, name, min, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(name + " must be a finite number between " + min + " and " + max);
  }
  return value;
}

/**
 * Normalize a declarative cue sheet. It never loads or transmits assets.
 * fileId is a caller-local reference, not a URL or filesystem path.
 */
export function createDramaTimeline(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Timeline input must be an object");
  }

  const duration = boundedNumber(input.voiceDurationSec, "voiceDurationSec", 0.1, MAX_SECONDS);
  const voiceGain = boundedNumber(input.voiceGain ?? 0.9, "voiceGain", 0, 1);
  const ambienceBusGain = boundedNumber(input.ambienceBusGain ?? 0.82, "ambienceBusGain", 0, 1);
  const foleyBusGain = boundedNumber(input.foleyBusGain ?? 0.9, "foleyBusGain", 0, 1);
  const masterGain = boundedNumber(input.masterGain ?? 0.85, "masterGain", 0, 1);
  const duckingAmount = boundedNumber(input.duckingAmount ?? 0.75, "duckingAmount", 0, 1);
  const foleyDuckingDepth = boundedNumber(input.foleyDuckingDepth ?? 0.35, "foleyDuckingDepth", 0, 1);
  const duckingEnabled = input.duckingEnabled !== false;
  const spatialMode = String(input.spatialMode ?? "stereo");
  if (!SPATIAL_MODES.has(spatialMode)) {
    throw new Error("spatialMode must be stereo or hrtf");
  }

  const cues = input.cues ?? [];
  if (!Array.isArray(cues) || cues.length > MAX_CUES) {
    throw new Error("cues must be an array of at most " + MAX_CUES + " items");
  }

  const normalized = cues.map((cue, index) => {
    if (!cue || typeof cue !== "object" || Array.isArray(cue)) {
      throw new Error("Cue " + index + " must be an object");
    }
    const kind = String(cue.kind ?? "");
    if (!EFFECT_KINDS.has(kind)) throw new Error("Cue " + index + " has unsupported kind");

    const fileId = String(cue.fileId ?? "").trim();
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(fileId)) {
      throw new Error("Cue " + index + " must use a safe local fileId (1–64 characters)");
    }

    const atSec = boundedNumber(cue.atSec ?? 0, "atSec", 0, duration);
    const gain = boundedNumber(cue.gain ?? (kind === "ambience" ? 0.1 : 0.22), "gain", 0, 0.7);
    const pan = boundedNumber(cue.pan ?? 0, "pan", -1, 1);
    const distanceMeters = boundedNumber(cue.distanceMeters ?? 1.5, "distanceMeters", 0.5, 8);
    const sourceOffsetSec = boundedNumber(cue.sourceOffsetSec ?? 0, "sourceOffsetSec", 0, MAX_SECONDS);
    const normalizationTargetRms = boundedNumber(
      cue.normalizationTargetRms ?? 0.1,
      "normalizationTargetRms",
      0.05,
      0.2,
    );
    const fadeInSec = boundedNumber(cue.fadeInSec ?? (kind === "ambience" ? 1 : 0.03), "fadeInSec", 0, 10);
    const fadeOutSec = boundedNumber(cue.fadeOutSec ?? (kind === "ambience" ? 1 : 0.1), "fadeOutSec", 0, 10);

    const loop = kind === "ambience" && cue.loop === true;
    const maxDuration = duration - atSec;
    const cueDurationSec = cue.durationSec == null
      ? null
      : boundedNumber(cue.durationSec, "durationSec", 0.01, maxDuration);

    if (cueDurationSec != null && fadeInSec + fadeOutSec > cueDurationSec) {
      throw new Error("Cue " + index + " fades exceed cue duration");
    }

    return Object.freeze({
      id: "cue-" + (index + 1),
      fileId,
      kind,
      atSec,
      gain,
      pan,
      distanceMeters,
      sourceOffsetSec,
      normalizationTargetRms,
      loop,
      fadeInSec,
      fadeOutSec,
      durationSec: cueDurationSec,
    });
  });

  return Object.freeze({
    version: 2,
    mode: "private_drama",
    voice: Object.freeze({ durationSec: duration, gain: voiceGain, pan: 0 }),
    mix: Object.freeze({
      ambienceBusGain,
      foleyBusGain,
      masterGain,
      duckingEnabled,
      duckingAmount,
      spatialMode,
      ducking: Object.freeze({
        thresholdDb: -42,
        attackSec: 0.045,
        releaseSec: 0.26,
        ambienceDepth: 0.65,
        foleyDepth: foleyDuckingDepth,
      }),
    }),
    cues: Object.freeze(normalized),
    output: Object.freeze({ maxDurationSec: MAX_SECONDS, channels: 2, sampleRate: 44100 }),
  });
}


/**
 * Build a deterministic effects-bus gain envelope from decoded voice samples.
 * The envelope is deliberately simple: RMS energy, not semantic speech detection.
 */
export function createVoiceDuckingEnvelope(channelData, sampleRate, options = {}) {
  if (!Array.isArray(channelData) || channelData.length < 1 ||
      !channelData.every((channel) => channel && typeof channel.length === "number")) {
    throw new Error("channelData must be a non-empty array of audio channels");
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    throw new Error("sampleRate must be a positive finite number");
  }
  const sampleCount = channelData[0].length;
  if (!Number.isInteger(sampleCount) || sampleCount < 1 ||
      !channelData.every((channel) => channel.length === sampleCount)) {
    throw new Error("audio channels must have the same non-zero length");
  }

  const amount = boundedNumber(options.amount ?? 0.5, "amount", 0, 1);
  const thresholdDb = boundedNumber(options.thresholdDb ?? -42, "thresholdDb", -100, -1);
  const attackSec = boundedNumber(options.attackSec ?? 0.045, "attackSec", 0.001, 5);
  const releaseSec = boundedNumber(options.releaseSec ?? 0.26, "releaseSec", 0.001, 5);
  const frameMs = boundedNumber(options.frameMs ?? 40, "frameMs", 10, 100);
  const frameSize = Math.max(1, Math.floor(sampleRate * frameMs / 1000));
  const frames = [];
  let smoothed = 1;

  for (let offset = 0; offset < sampleCount; offset += frameSize) {
    const end = Math.min(sampleCount, offset + frameSize);
    let sumSquares = 0;
    let count = 0;
    for (const channel of channelData) {
      for (let i = offset; i < end; i++) {
        const sample = Number(channel[i]) || 0;
        sumSquares += sample * sample;
        count += 1;
      }
    }
    const rms = count ? Math.sqrt(sumSquares / count) : 0;
    const levelDb = rms > 0.000001 ? 20 * Math.log10(rms) : -120;
    const activity = Math.max(0, Math.min(1, (levelDb - thresholdDb) / (0 - thresholdDb)));
    const target = 1 - amount * activity;
    const frameSeconds = (end - offset) / sampleRate;
    const timeConstant = target < smoothed ? attackSec : releaseSec;
    const smoothing = 1 - Math.exp(-frameSeconds / timeConstant);
    smoothed += (target - smoothed) * smoothing;
    frames.push(Object.freeze({
      atSec: end / sampleRate,
      gain: Math.max(0, Math.min(1, smoothed)),
    }));
  }

  return Object.freeze(frames);
}

export const DRAMA_TIMELINE_LIMITS = Object.freeze({
  maxCues: MAX_CUES,
  maxSeconds: MAX_SECONDS,
  effectKinds: Object.freeze([...EFFECT_KINDS]),
  spatialModes: Object.freeze([...SPATIAL_MODES]),
  distanceMeters: Object.freeze({ min: 0.5, max: 8, default: 1.5 }),
});
