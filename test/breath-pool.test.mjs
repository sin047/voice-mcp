import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBreathSegments } from "../src/breath-engine.mjs";
import { planBreathPool } from "../src/breath-pool.mjs";

const sampleRate = 24000;

function voiceWithGap(gapSec = 1.8) {
  const durationSec = 0.5 + gapSec + 0.5;
  const samples = new Float32Array(Math.ceil(durationSec * sampleRate));
  const addSpeech = (startSec, duration) => {
    const start = Math.round(startSec * sampleRate);
    const end = Math.min(samples.length, Math.round((startSec + duration) * sampleRate));
    for (let i = start; i < end; i += 1) {
      samples[i] = 0.12 * Math.sin(2 * Math.PI * 130 * (i - start) / sampleRate);
    }
  };
  addSpeech(0.1, 0.5);
  addSpeech(0.6 + gapSec, 0.5);
  return samples;
}

function assets() {
  return [
    { id: "fx_exhale", kind: "breath", breathType: "exhale", status: "approved", durationSec: 0.3, rms: 0.04, createdAt: "2026-11-01T00:00:00Z" },
    { id: "fx_inhale", kind: "breath", breathType: "inhale", status: "approved", durationSec: 0.3, rms: 0.04, createdAt: "2026-11-01T00:00:01Z" },
  ];
}

test("breath pool places an exhale and an inhale at opposite phrase edges in a long silent gap", () => {
  const samples = voiceWithGap(1.8);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const plan = planBreathPool({ samples, sampleRate, analysis, assets: assets(), performance: "close" });
  assert.equal(plan.approvedAssetCount, 2);
  assert.equal(plan.insertions.length, 2);
  assert.deepEqual(plan.insertions.map((item) => item.breathType), ["exhale", "inhale"]);
  assert.ok(plan.insertions[0].atSec < plan.insertions[1].atSec);
  assert.ok(plan.insertions[0].atSec + plan.insertions[0].durationSec < plan.insertions[1].atSec);
  assert.equal(plan.durationPreserved, true);
  assert.equal(plan.speechSamplesPreserved, true);
});

test("breath pool inserts at most one clip in a shorter eligible gap", () => {
  const samples = voiceWithGap(1.0);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const plan = planBreathPool({ samples, sampleRate, analysis, assets: assets(), performance: "close" });
  assert.equal(plan.insertions.length, 1);
  assert.equal(plan.insertions[0].breathType, "exhale");
  assert.ok(plan.insertions[0].atSec >= 0.6 + 0.02);
});

test("breath pool never uses pending assets and reports an empty pool", () => {
  const samples = voiceWithGap(1.8);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const pending = assets().map((item) => ({ ...item, status: "pending" }));
  const plan = planBreathPool({ samples, sampleRate, analysis, assets: pending });
  assert.equal(plan.insertions.length, 0);
  assert.equal(plan.approvedAssetCount, 0);
  assert.equal(plan.skippedReason, "no_approved_breath_assets");
});

test("breath pool avoids adding clips to soft or breathy delivery", () => {
  const samples = voiceWithGap(1.8);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const plan = planBreathPool({ samples, sampleRate, analysis, assets: assets(), performance: "soft" });
  assert.equal(plan.insertions.length, 0);
  assert.equal(plan.skippedReason, "soft_or_breathy_delivery");
});

test("breath pool skips passages with three or more already accepted breaths", () => {
  const samples = voiceWithGap(1.8);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const withExisting = {
    ...analysis,
    breaths: Array.from({ length: 3 }, () => ({ accepted: true })),
  };
  const plan = planBreathPool({ samples, sampleRate, analysis: withExisting, assets: assets() });
  assert.equal(plan.insertions.length, 0);
  assert.equal(plan.skippedReason, "existing_breaths_at_or_above_limit");
});

test("breath pool skips gaps occupied by an existing non-speech island", () => {
  const samples = voiceWithGap(1.8);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const blocker = {
    index: 99, kind: "unvoiced",
    startSample: Math.round(1.0 * sampleRate),
    endSample: Math.round(1.2 * sampleRate),
  };
  const withBlocker = { ...analysis, islands: [...analysis.islands, blocker] };
  const plan = planBreathPool({ samples, sampleRate, analysis: withBlocker, assets: assets() });
  assert.equal(plan.insertions.length, 0);
  assert.equal(plan.skippedReason, "no_eligible_silent_gap");
});
