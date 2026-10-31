import { soundscapeGain } from "./soundscape-levels.mjs";

const PRESETS = Object.freeze({
  rain: [
    {
      assetName: "雨声",
      kind: "ambience",
      atSec: 0,
      gain: soundscapeGain("background"),
      pan: 0,
      distanceMeters: 1.5,
      fadeInSec: 0.15,
      fadeOutSec: 0.35,
      loop: true,
    },
  ],
  desk: [
    {
      assetName: "键盘打字",
      kind: "ambience",
      atSec: 0,
      gain: soundscapeGain("backgroundDiscrete"),
      pan: -0.08,
      distanceMeters: 1.5,
      fadeInSec: 0.2,
      fadeOutSec: 0.35,
      loop: true,
    },
  ],
  package: [
    {
      assetName: "包装撕开",
      kind: "foley",
      atSec: 0,
      gain: soundscapeGain("action"),
      pan: -0.22,
      distanceMeters: 1.1,
      fadeInSec: 0.08,
      fadeOutSec: 0.35,
      durationSec: 1.8,
    },
    {
      assetName: "盒子开封",
      kind: "foley",
      atSec: 2,
      gain: soundscapeGain("action", 2.0),
      normalizationTargetRms: 0.14,
      pan: 0.2,
      distanceMeters: 1,
      fadeInSec: 0.06,
      fadeOutSec: 0.4,
      durationSec: 2.2,
    },
  ],
  close: [
    {
      assetName: "衣物摩擦",
      kind: "foley",
      atSec: 0,
      sourceOffsetSec: 12,
      gain: soundscapeGain("contact", 2.25),
      normalizationTargetRms: 0.14,
      pan: -0.38,
      distanceMeters: 1,
      fadeInSec: 0.12,
      fadeOutSec: 0.4,
      durationSec: 3.2,
    },
    {
      assetName: "湿润细节",
      kind: "foley",
      atSec: 3.2,
      sourceOffsetSec: 12,
      gain: soundscapeGain("detail"),
      pan: 0.48,
      distanceMeters: 1,
      fadeInSec: 0.1,
      fadeOutSec: 0.35,
      durationSec: 2.4,
    },
  ],
  intimate: [
    {
      assetName: "衣物摩擦",
      kind: "foley",
      atSec: 0,
      // Intimate cues are sequential, not simultaneous layers; use a restrained contact level.
      gain: soundscapeGain("layered", 0.7),
      pan: -0.16,
      distanceMeters: 1.2,
      fadeInSec: 0.25,
      fadeOutSec: 0.55,
      durationSec: 3.4,
    },
    {
      assetName: "润滑液涂抹",
      kind: "foley",
      atSec: 3,
      gain: soundscapeGain("detail", -4.5),
      pan: 0.16,
      distanceMeters: 0.9,
      fadeInSec: 0.18,
      fadeOutSec: 0.45,
      durationSec: 2.6,
    },
    {
      assetName: "连续节奏",
      kind: "foley",
      atSec: 6,
      gain: soundscapeGain("contact", 0.92),
      normalizationTargetRms: 0.14,
      pan: -0.1,
      distanceMeters: 1.1,
      fadeInSec: 0.3,
      fadeOutSec: 0.55,
      durationSec: 3.8,
    },
    {
      assetName: "床铺物件声",
      kind: "foley",
      atSec: 10,
      gain: soundscapeGain("contact", 0.92),
      normalizationTargetRms: 0.14,
      pan: 0.12,
      distanceMeters: 1.2,
      fadeInSec: 0.25,
      fadeOutSec: 0.55,
      durationSec: 3.4,
    },
    {
      assetName: "收尾音效",
      kind: "foley",
      atSec: 14,
      gain: soundscapeGain("detail"),
      normalizationTargetRms: 0.14,
      pan: 0,
      distanceMeters: 1,
      fadeInSec: 0.12,
      fadeOutSec: 0.45,
      durationSec: 1.4,
    },
  ],
  // Single-action presets: exactly one fixed Foley asset per call, with a longer audible window.
  clothing: [
    {
      assetName: "衣物摩擦",
      kind: "foley",
      atSec: 0,
      sourceOffsetSec: 12,
      gain: soundscapeGain("contact", 2.25),
      normalizationTargetRms: 0.14,
      pan: -0.38,
      distanceMeters: 1,
      fadeInSec: 0.15,
      fadeOutSec: 0.7,
      durationSec: 6,
    },
  ],
  lubricant: [
    {
      assetName: "润滑液涂抹",
      kind: "foley",
      atSec: 0,
      gain: soundscapeGain("detail", -4.5),
      pan: 0.16,
      distanceMeters: 0.9,
      fadeInSec: 0.2,
      fadeOutSec: 0.7,
      durationSec: 6,
    },
  ],
  rhythm: [
    {
      assetName: "连续节奏",
      kind: "foley",
      atSec: 0,
      gain: soundscapeGain("contact", 0.92),
      normalizationTargetRms: 0.14,
      pan: -0.1,
      distanceMeters: 1.1,
      fadeInSec: 0.35,
      fadeOutSec: 0.9,
      durationSec: 8,
    },
  ],
  bed: [
    {
      assetName: "床铺物件声",
      kind: "foley",
      atSec: 0,
      gain: soundscapeGain("contact", 0.92),
      normalizationTargetRms: 0.14,
      pan: 0.12,
      distanceMeters: 1.2,
      fadeInSec: 0.35,
      fadeOutSec: 0.9,
      durationSec: 8,
    },
  ],
  finish: [
    {
      assetName: "收尾音效",
      kind: "foley",
      atSec: 0,
      gain: soundscapeGain("detail"),
      normalizationTargetRms: 0.14,
      pan: 0,
      distanceMeters: 1,
      fadeInSec: 0.12,
      fadeOutSec: 0.65,
      durationSec: 4,
    },
  ],
});

const SUPPORTED_PRESETS = new Set(Object.keys(PRESETS));
const DIRECTIVE = /^\s*\[soundscape:([a-z-]+)(?::(\d+(?:\.\d+)?))?\]\s*/i;

export function parseSoundscapeDirective(direction) {
  if (typeof direction !== "string") {
    return Object.freeze({ preset: null, voiceDirection: direction });
  }
  const match = direction.match(DIRECTIVE);
  if (!match) return Object.freeze({ preset: null, voiceDirection: direction });
  const preset = match[1].toLowerCase();
  if (!SUPPORTED_PRESETS.has(preset)) {
    throw new Error(
      "Unknown soundscape preset. Supported presets: " + [...SUPPORTED_PRESETS].join(", "),
    );
  }
  const durationSec = match[2] == null ? undefined : Number(match[2]);
  if (durationSec != null && (!Number.isFinite(durationSec) || durationSec < 0.1 || durationSec > 60)) {
    throw new Error("Soundscape duration must be between 0.1 and 60 seconds");
  }
  const voiceDirection = direction.slice(match[0].length).trim();
  return Object.freeze({
    preset,
    durationSec,
    voiceDirection: voiceDirection || undefined,
  });
}

export function buildSoundscapePresetCues(preset, assets = [], durationSec) {
  if (!SUPPORTED_PRESETS.has(preset)) {
    throw new Error("Unsupported soundscape preset: " + String(preset));
  }
  const definitions = PRESETS[preset];
  const cues = [];
  const missingAssets = [];

  for (const definition of definitions) {
    const asset = assets.find((item) =>
      item.kind === definition.kind &&
      typeof item.name === "string" &&
      item.name.includes(definition.assetName)
    );
    if (!asset) {
      missingAssets.push(definition.assetName);
      continue;
    }
    if (durationSec != null && (definitions.length !== 1 || definition.kind !== "foley")) {
      throw new Error("Custom duration is supported only for single-action Foley presets");
    }
    const { assetName, ...cue } = definition;
    cues.push({ fileId: asset.id, ...cue, ...(durationSec == null ? {} : { durationSec }) });
  }

  return Object.freeze({
    preset,
    cues: Object.freeze(cues.map((cue) => Object.freeze(cue))),
    missingAssets: Object.freeze(missingAssets),
  });
}

export function listSoundscapePresets() {
  return Object.freeze([...SUPPORTED_PRESETS]);
}
