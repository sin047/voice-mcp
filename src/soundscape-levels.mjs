/**
 * Shin Voice soundscape mixing levels — v1.
 *
 * These are PRESET CUE GAINS (0..0.7), not playback percentages or LUFS.
 * Actual output also depends on source loudness, excerpt normalization,
 * bus gain, voice ducking and master gain. The rain value is a user-approved
 * anchor and must not change without a new listening test.
 */
export const SOUNDSCAPE_LEVELS = Object.freeze({
  background: Object.freeze({ gain: 0.48, purpose: "continuous ambience; approved rain baseline" }),
  backgroundDiscrete: Object.freeze({ gain: 0.25, purpose: "intermittent environmental details, e.g. distant typing" }),
  approach: Object.freeze({ gain: 0.34, purpose: "someone or something moving closer; future cue preset" }),
  contact: Object.freeze({ gain: 0.54, purpose: "close clothing, touch and physical contact" }),
  detail: Object.freeze({ gain: 0.46, purpose: "short foreground micro-detail" }),
  action: Object.freeze({ gain: 0.20, purpose: "object handling, packaging and similar Foley" }),
  layered: Object.freeze({ gain: 0.12, purpose: "one layer among several simultaneous Foley tracks" }),
});

export function soundscapeGain(role, trimDb = 0) {
  const config = SOUNDSCAPE_LEVELS[role];
  if (!config) throw new Error("Unsupported soundscape level role: " + String(role));
  if (typeof trimDb !== "number" || !Number.isFinite(trimDb) || trimDb < -12 || trimDb > 12) {
    throw new Error("soundscape gain trim must be between -12 and +12 dB");
  }
  const gain = config.gain * 10 ** (trimDb / 20);
  return Math.round(Math.max(0, Math.min(0.7, gain)) * 1000) / 1000;
}
