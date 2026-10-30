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
        foleyDepth: 0.35,
      }),
    }),
    cues: Object.freeze(normalized),
    output: Object.freeze({ maxDurationSec: MAX_SECONDS, channels: 2, sampleRate: 44100 }),
  });
}

export const DRAMA_TIMELINE_LIMITS = Object.freeze({
  maxCues: MAX_CUES,
  maxSeconds: MAX_SECONDS,
  effectKinds: Object.freeze([...EFFECT_KINDS]),
  spatialModes: Object.freeze([...SPATIAL_MODES]),
});
