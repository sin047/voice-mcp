import test from "node:test";
import assert from "node:assert/strict";
import { analyzeBreathSegments } from "../src/breath-engine.mjs";
import { repairBreathSegments } from "../src/breath-repair.mjs";

const sampleRate = 24000;

function addSine(samples, startSec, durationSec, frequency = 120, amplitude = 0.12) {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(samples.length, Math.round((startSec + durationSec) * sampleRate));
  for (let i = start; i < end; i += 1) {
    samples[i] = amplitude * Math.sin(2 * Math.PI * frequency * (i - start) / sampleRate);
  }
}

function addNoiseBreath(samples, startSec, durationSec, direction, amplitude = 0.012, shape = "ramped") {
  const start = Math.round(startSec * sampleRate);
  const end = Math.min(samples.length, Math.round((startSec + durationSec) * sampleRate));
  let seed = 123456789;
  for (let i = start; i < end; i += 1) {
    seed = (1664525 * seed + 1013904223) >>> 0;
    const random = (seed / 0xffffffff) * 2 - 1;
    const progress = (i - start) / Math.max(1, end - start - 1);
    let envelope;
    if (shape === "fast") {
      envelope = direction === "in"
        ? 0.2 + 0.8 * Math.min(1, progress * 6)
        : 1 - 0.8 * progress;
    } else {
      envelope = direction === "in" ? 0.2 + 0.8 * progress : 1 - 0.8 * progress;
    }
    samples[i] = random * amplitude * envelope;
  }
}

function fixture(direction, shape = "ramped", amplitude = 0.05) {
  const samples = new Float32Array(sampleRate * 3);
  addSine(samples, 0.1, 0.6);
  addNoiseBreath(samples, 1.0, 0.3, direction, amplitude, shape);
  addSine(samples, 2.0, 0.6);
  return samples;
}

function rms(samples, start, end) {
  let sum = 0;
  for (let i = start; i < end; i += 1) sum += samples[i] * samples[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

test("enhanced repair attenuates an over-loud exhale and preserves speech samples", () => {
  const samples = fixture("out");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const breath = analysis.breaths.find((item) => item.accepted);
  assert.ok(breath);
  assert.equal(breath.breathType, "exhale");

  const result = repairBreathSegments({ samples, sampleRate, analysis });
  assert.equal(result.candidateCount, 1);
  assert.equal(result.attenuatedCount, 1);
  assert.equal(result.fadeOutCount, 1);
  assert.equal(result.repositionedCount, 0);
  assert.equal(result.durationPreserved, true);
  assert.equal(result.speechSamplesPreserved, true);
  assert.ok(
    rms(result.samples, breath.startSample, breath.endSample) <
    rms(samples, breath.startSample, breath.endSample)
  );
  assert.deepEqual(
    result.samples.subarray(Math.round(0.1 * sampleRate), Math.round(0.7 * sampleRate)),
    samples.subarray(Math.round(0.1 * sampleRate), Math.round(0.7 * sampleRate))
  );
});

test("enhanced repair smooths and repositions a high-confidence opening inhale", () => {
  const samples = fixture("in", "fast");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const breath = analysis.breaths.find((item) => item.accepted);
  assert.ok(breath);
  assert.equal(breath.breathType, "inhale");

  const result = repairBreathSegments({ samples, sampleRate, analysis });
  assert.equal(result.smoothedCount, 1);
  assert.equal(result.repositionedCount, 1);
  assert.equal(result.durationPreserved, true);
  assert.equal(result.speechSamplesPreserved, true);
  assert.deepEqual(
    result.samples.subarray(Math.round(2.0 * sampleRate)),
    samples.subarray(Math.round(2.0 * sampleRate))
  );
  assert.ok(result.adjustments[0].toStartSec > result.adjustments[0].fromStartSec);
});

test("enhanced repair leaves low-confidence candidates untouched", () => {
  const samples = fixture("in");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  const lowConfidence = {
    ...analysis,
    breaths: analysis.breaths.map((breath) => ({ ...breath, confidence: 0.49 })),
  };
  const result = repairBreathSegments({ samples, sampleRate, analysis: lowConfidence });
  assert.deepEqual(result.samples, samples);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.repositionedCount, 0);
  assert.equal(result.attenuatedCount, 0);
  assert.equal(result.smoothedCount, 0);
});

test("enhanced repair rejects mismatched analysis and invalid sample data", () => {
  const samples = fixture("in");
  const analysis = analyzeBreathSegments({ samples, sampleRate });
  assert.throws(
    () => repairBreathSegments({ samples, sampleRate: 22050, analysis }),
    /same samples and sample rate/
  );
  assert.throws(
    () => repairBreathSegments({ samples: [0, 1], sampleRate, analysis }),
    /Float32Array/
  );
});
