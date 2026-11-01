import test from "node:test";
import assert from "node:assert/strict";
import { detectSpeechGaps, planBreathCues } from "../src/breath-engine.mjs";

function pcmWithRegions(regions, durationSec = 2, sampleRate = 10000) {
  const samples = new Float32Array(Math.round(durationSec * sampleRate));
  for (const [startSec, endSec, value = 0.12] of regions) {
    samples.fill(value, Math.round(startSec * sampleRate), Math.round(endSec * sampleRate));
  }
  return { channels: [samples], sampleRate, frameCount: samples.length, durationSec };
}

const assets = [
  { id: "inhale-a", kind: "breath", breathType: "inhale", durationSec: 0.32 },
  { id: "exhale-a", kind: "breath", breathType: "exhale", durationSec: 0.36 },
];

test("detects only sufficiently long internal silence windows", () => {
  const pcm = pcmWithRegions([[0.2, 0.55], [1.25, 1.6]], 2);
  const gaps = detectSpeechGaps(pcm, { minGapSec: 0.6 });
  assert.equal(gaps.length, 1);
  assert.ok(Math.abs(gaps[0].startSec - 0.55) <= 0.01);
  assert.ok(Math.abs(gaps[0].endSec - 1.25) <= 0.01);
  assert.ok(gaps[0].durationSec >= 0.69);
});

test("places exhale at the previous phrase tail and inhale before the next phrase", () => {
  const pcm = pcmWithRegions([[0.2, 0.5], [1.7, 1.9]], 2.1);
  const planned = planBreathCues({ pcm, assets, minGapSec: 0.7, maxBreaths: 4 });
  assert.equal(planned.cues.length, 2);
  const exhale = planned.cues.find((cue) => cue.breathType === "exhale");
  const inhale = planned.cues.find((cue) => cue.breathType === "inhale");
  assert.ok(exhale);
  assert.ok(inhale);
  assert.ok(exhale.atSec >= 0.54 && exhale.atSec < 0.6);
  assert.ok(inhale.atSec + inhale.durationSec <= 1.65);
  assert.ok(inhale.atSec > exhale.atSec + exhale.durationSec);
  assert.equal(planned.report.voice_samples_modified, false);
  assert.equal(planned.report.extra_tts_calls, 0);
});

test("uses one sample in a shorter gap and respects the maximum cue count", () => {
  const pcm = pcmWithRegions([[0.2, 0.5], [1.25, 1.55], [2.2, 2.5]], 2.8);
  const planned = planBreathCues({
    pcm,
    assets,
    minGapSec: 0.6,
    maxBreaths: 1,
  });
  assert.equal(planned.cues.length, 1);
  assert.equal(planned.cues[0].breathType, "inhale");
  assert.ok(planned.cues[0].atSec >= 0.6);
  assert.ok(planned.cues[0].atSec + planned.cues[0].durationSec <= 1.2);
});

test("does not place a breath over an existing cue", () => {
  const pcm = pcmWithRegions([[0.2, 0.5], [1.7, 1.9]], 2.1);
  const planned = planBreathCues({
    pcm,
    assets,
    minGapSec: 0.7,
    occupiedCues: [{ atSec: 0.55, durationSec: 0.8 }],
  });
  assert.equal(planned.cues.length, 0);
  assert.ok(planned.report.skipped_gap_count >= 1);
});

test("rejects missing or invalid breath assets", () => {
  const pcm = pcmWithRegions([[0.2, 0.5], [1.7, 1.9]], 2.1);
  assert.throws(() => planBreathCues({ pcm, assets: [] }), /at least one uploaded breath asset/);
  assert.throws(() => planBreathCues({ pcm, assets, maxBreaths: 7 }), /between 1 and 6/);
});
