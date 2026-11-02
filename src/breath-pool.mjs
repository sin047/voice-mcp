function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rms(samples, start, end) {
  const from = Math.max(0, Math.floor(start));
  const to = Math.min(samples.length, Math.ceil(end));
  if (to <= from) return 0;
  let sumSquares = 0;
  for (let i = from; i < to; i += 1) sumSquares += samples[i] * samples[i];
  return Math.sqrt(sumSquares / (to - from));
}

function phraseReferenceRms(samples, sampleRate, island, breathType) {
  const windowSamples = Math.max(1, Math.round(sampleRate * 0.5));
  const start = breathType === "inhale"
    ? island.startSample
    : Math.max(island.startSample, island.endSample - windowSamples);
  const end = breathType === "inhale"
    ? Math.min(island.endSample, island.startSample + windowSamples)
    : island.endSample;
  return rms(samples, start, end);
}

function seededAssetRank(seed, assetId) {
  const input = String(seed) + ":" + assetId;
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function chooseAsset(assets, breathType, usedIds, selectionSeed) {
  return assets
    .filter((asset) =>
      asset.breathType === breathType &&
      !usedIds.has(asset.id) &&
      Number.isFinite(asset.durationSec) &&
      asset.durationSec >= 0.22 &&
      asset.durationSec <= 1.1
    )
    .sort((a, b) =>
      seededAssetRank(selectionSeed, a.id) - seededAssetRank(selectionSeed, b.id) ||
      a.id.localeCompare(b.id)
    )[0] || null;
}

/**
 * Plan approved breath clips into genuinely silent inter-phrase gaps.
 * This function never edits voice samples and never synthesizes audio.
 */
export function planBreathPool({
  samples,
  sampleRate,
  analysis,
  assets = [],
  performance = "natural",
  minGapSec = 0.75,
  maxInsertions = 2,
  maxExistingBreaths = 3,
  targetBelowSpeechDb = 8,
  maxClipGain = 2,
  minimumClipGain = 0.25,
  minClipSpacingSec = 0.1,
  selectionSeed = "voice-mcp-breath-pool-v1",
} = {}) {
  if (!(samples instanceof Float32Array) || !samples.length) {
    throw new Error("samples must be a non-empty Float32Array");
  }
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error("sampleRate must be an integer between 8000 and 96000 Hz");
  }
  if (!analysis || analysis.sampleRate !== sampleRate ||
      analysis.sampleCount !== samples.length ||
      !Array.isArray(analysis.islands) || !Array.isArray(analysis.breaths)) {
    throw new Error("analysis must be produced from the same samples and sample rate");
  }
  if (!Array.isArray(assets)) throw new Error("assets must be an array");
  if (typeof selectionSeed !== "string" || selectionSeed.length > 128) {
    throw new Error("selectionSeed must be a string no longer than 128 characters");
  }
  for (const [name, value, min, max] of [
    ["minGapSec", minGapSec, 0.5, 3],
    ["maxInsertions", maxInsertions, 1, 8],
    ["maxExistingBreaths", maxExistingBreaths, 0, 10],
    ["targetBelowSpeechDb", targetBelowSpeechDb, 3, 24],
    ["maxClipGain", maxClipGain, 0.1, 8],
    ["minimumClipGain", minimumClipGain, 0, maxClipGain],
    ["minClipSpacingSec", minClipSpacingSec, 0, 1],
  ]) {
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(name + " must be between " + min + " and " + max);
    }
  }

  const acceptedBreaths = analysis.breaths.filter((breath) => breath.accepted === true);
  const base = {
    insertions: [],
    existingBreathCount: acceptedBreaths.length,
    approvedAssetCount: 0,
    assetCounts: Object.freeze({ inhale: 0, exhale: 0 }),
    variationReady: false,
    selectionStrategy: "seeded_per_render",
    durationPreserved: true,
    speechSamplesPreserved: true,
    skippedReason: null,
  };

  if (performance === "soft" || performance === "breathy") {
    return Object.freeze({ ...base, skippedReason: "soft_or_breathy_delivery" });
  }
  if (acceptedBreaths.length >= maxExistingBreaths) {
    return Object.freeze({ ...base, skippedReason: "existing_breaths_at_or_above_limit" });
  }

  const approved = assets
    .filter((asset) =>
      asset &&
      asset.kind === "breath" &&
      asset.status === "approved" &&
      (asset.breathType === "inhale" || asset.breathType === "exhale") &&
      Number.isFinite(asset.durationSec) &&
      asset.durationSec >= 0.22 &&
      asset.durationSec <= 1.1 &&
      typeof asset.id === "string"
    )
    .sort((a, b) =>
      String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
      a.id.localeCompare(b.id)
    );
  base.approvedAssetCount = approved.length;
  const inhaleAssetCount = approved.filter((asset) => asset.breathType === "inhale").length;
  const exhaleAssetCount = approved.filter((asset) => asset.breathType === "exhale").length;
  base.assetCounts = Object.freeze({ inhale: inhaleAssetCount, exhale: exhaleAssetCount });
  base.variationReady = inhaleAssetCount >= 2 && exhaleAssetCount >= 2;
  if (!approved.length) {
    return Object.freeze({ ...base, skippedReason: "no_approved_breath_assets" });
  }

  const speech = analysis.islands
    .filter((island) => island.kind === "speech")
    .sort((a, b) => a.startSample - b.startSample);
  if (speech.length < 2) {
    return Object.freeze({ ...base, skippedReason: "no_inter_phrase_gap" });
  }

  const usedIds = new Set();
  const insertions = [];
  for (let i = 0; i < speech.length - 1 && insertions.length < maxInsertions; i += 1) {
    const previous = speech[i];
    const next = speech[i + 1];
    const gapStartSample = previous.endSample;
    const gapEndSample = next.startSample;
    const gapStartSec = gapStartSample / sampleRate;
    const gapEndSec = gapEndSample / sampleRate;
    const gapDurationSec = gapEndSec - gapStartSec;
    if (gapDurationSec < minGapSec) continue;

    const occupiedIsland = analysis.islands.some((island) =>
      island.kind !== "speech" &&
      island.startSample >= gapStartSample &&
      island.endSample <= gapEndSample
    );
    if (occupiedIsland) continue;

    const exhale = chooseAsset(approved, "exhale", usedIds, selectionSeed);
    const inhale = chooseAsset(approved, "inhale", usedIds, selectionSeed);
    const gapInsertions = [];

    const makeInsertion = (asset, breathType, atSec, speechIsland) => {
      const referenceRms = phraseReferenceRms(samples, sampleRate, speechIsland, breathType);
      const sourceRms = Number.isFinite(asset.rms) && asset.rms > 0 ? asset.rms : 0.05;
      const targetRms = referenceRms * Math.pow(10, -targetBelowSpeechDb / 20);
      const gain = clamp(targetRms / sourceRms, minimumClipGain, maxClipGain);
      return {
        assetId: asset.id,
        breathType,
        atSec: Number(atSec.toFixed(4)),
        durationSec: asset.durationSec,
        gain: Number(gain.toFixed(4)),
        fadeInSec: breathType === "exhale" ? 0.03 : 0,
        fadeOutSec: breathType === "inhale" ? 0.035 : 0,
        referenceSpeechRms: Number(referenceRms.toFixed(5)),
        targetRelativeSpeechDb: -targetBelowSpeechDb,
      };
    };

    if (gapDurationSec >= 1.5 && exhale && inhale) {
      const exhaleAt = gapStartSec + 0.05;
      const inhaleAt = gapEndSec - 0.06 - inhale.durationSec;
      if (exhaleAt + exhale.durationSec + minClipSpacingSec <= inhaleAt) {
        gapInsertions.push(makeInsertion(exhale, "exhale", exhaleAt, previous));
        gapInsertions.push(makeInsertion(inhale, "inhale", inhaleAt, next));
      }
    }

    if (!gapInsertions.length) {
      const selected = exhale || inhale;
      if (!selected) continue;
      const breathType = selected.breathType;
      const atSec = breathType === "exhale"
        ? gapStartSec + 0.05
        : gapEndSec - 0.06 - selected.durationSec;
      const speechIsland = breathType === "exhale" ? previous : next;
      if (atSec < gapStartSec + 0.02 ||
          atSec + selected.durationSec > gapEndSec - 0.02) continue;
      gapInsertions.push(makeInsertion(selected, breathType, atSec, speechIsland));
    }

    for (const insertion of gapInsertions) {
      if (insertions.length >= maxInsertions) break;
      if (usedIds.has(insertion.assetId)) continue;
      usedIds.add(insertion.assetId);
      insertions.push(insertion);
    }
  }

  return Object.freeze({
    ...base,
    insertions: Object.freeze(insertions.map((item) => Object.freeze(item))),
    skippedReason: insertions.length ? null : "no_eligible_silent_gap",
  });
}
