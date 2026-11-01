import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBreathSegments, repositionOpeningBreaths } from "../src/breath-engine.mjs";

const sampleRate = 24000;

function addSine(samples, startSec, durationSec, frequency = 120, amplitude = 0.12) {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(samples.length, Math.round((startSec + durationSec) * sampleRate));
  for (let i = start; i < end; i += 1) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * (i - start) / sampleRate);
  }
}

function addNoiseBreath(samples, startSec, durationSec, direction = "in") {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(samples.length, Math.round((startSec + durationSec) * sampleRate));
  let seed = 123456789;
  for (let i = start; i < end; i += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const random = (seed / 0xffffffff) * 2 - 1;
    const progress = (i - start) / Math.max(1, end - start - 1);
    const envelope = direction === "in" ? 0.2 + 0.8 * progress : 1 - 0.8 * progress;
    samples[i] = random * 0.012 * envelope;
  }
}

function fixture(direction = "in") {
  const samples = new Float32Array(sampleRate * 3);
  addSine(samples, 0.1, 0.6);
  addNoiseBreath(samples, 1.0, 0.3, direction);
  addSine(samples, 2.0, 0.6);
  return samples;
}

test("identifies a rising unvoiced island as a breath-like inhale", () => {
  const samples = fixture("in");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const breath = analysis.breaths.find((item) => item.accepted);
  assert.ok(breath);
  assert.equal(breath.breathType, "inhale");
  assert.ok(breath.voicedRatio <= 0.15);
  assert.ok(breath.relativeSpeechDb < -4);
});

test("identifies a falling unvoiced island as an exhale", () => {
  const samples = fixture("out");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const breath = analysis.breaths.find((item) => item.accepted);
  assert.ok(breath);
  assert.equal(breath.breathType, "exhale");
});

test("does not classify a voiced speech island as a breath", () => {
  const samples = new Float32Array(sampleRate * 2);
  addSine(samples, 0.1, 0.6);
  addSine(samples, 1.0, 0.5, 180, 0.08);
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  assert.equal(analysis.breaths.length, 0);
});

test("repositions an opening inhale without changing duration or speech samples", () => {
  const samples = fixture("in");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const speechStart = Math.round(2.0 * sampleRate);
  const result = repositionOpeningBreaths({ samples, sampleRate, analysis });
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.samples.length, samples.length);
  assert.equal(result.durationPreserved, true);
  assert.equal(result.speechSamplesPreserved, true);
  assert.deepEqual(result.samples.subarray(speechStart), samples.subarray(speechStart));
  assert.ok(result.adjustments[0].toStartSec > result.adjustments[0].fromStartSec);
});

test("does not move an exhale or a breath with too little preceding silence", () => {
  const exhale = fixture("out");
  const exhaleAnalysis = analyzeBreathSegments({ samples: exhale, sampleRate });
  assert.equal(repositionOpeningBreaths({ samples: exhale, sampleRate, analysis: exhaleAnalysis }).adjustments.length, 0);

  const shortLead = new Float32Array(sampleRate * 2);
  addSine(shortLead, 0.1, 0.6);
  addNoiseBreath(shortLead, 0.75, 0.3, "in");
  addSine(shortLead, 1.3, 0.5);
  const shortAnalysis = analyzeBreathSegments({ samples: shortLead, sampleRate });
  assert.equal(repositionOpeningBreaths({ samples: shortLead, sampleRate, analysis: shortAnalysis }).adjustments.length, 0);
});

test("rejects mismatched analysis and invalid input", () => {
  const samples = fixture("in");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  assert.throws(() => repositionOpeningBreaths({ samples, sampleRate: 22050, analysis }), /same samples/);
  assert.throws(() => analyzeBreathSegments({ samples: [0, 1], sampleRate }), /Float32Array/);
});
