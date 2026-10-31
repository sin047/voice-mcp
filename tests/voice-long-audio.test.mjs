import test from "node:test";
import assert from "node:assert/strict";
import { joinPcm16Chunks } from "../src/voice-long-audio.mjs";
import { decodeRawPcm16, decodePcmWav, encodePcm16Wav } from "../src/wav-audio.mjs";

test("joins PCM chunks into one continuous buffer with a controlled silent boundary", () => {
  const first = Buffer.from([1, 0, 2, 0]);
  const second = Buffer.from([3, 0, 4, 0]);
  const joined = joinPcm16Chunks([first, second], {
    sampleRate: 8000,
    boundaryPauseMs: 1,
  });
  assert.equal(joined.frameCount, 12);
  assert.equal(joined.durationSec, 12 / 8000);
  assert.deepEqual([...joined.buffer], [1, 0, 2, 0, ...Array(16).fill(0), 3, 0, 4, 0]);
});

test("joins without inserting silence when boundary pause is zero", () => {
  const joined = joinPcm16Chunks([
    Buffer.from([1, 0]),
    Buffer.from([2, 0]),
  ], { sampleRate: 24000, boundaryPauseMs: 0 });
  assert.deepEqual([...joined.buffer], [1, 0, 2, 0]);
  assert.equal(joined.durationSec, 2 / 24000);
});

test("preserves stereo frame alignment", () => {
  const joined = joinPcm16Chunks([
    Buffer.from([1, 0, 2, 0]),
    Buffer.from([3, 0, 4, 0]),
  ], { sampleRate: 8000, channels: 2, boundaryPauseMs: 0 });
  assert.equal(joined.frameCount, 2);
  assert.deepEqual([...joined.buffer], [1, 0, 2, 0, 3, 0, 4, 0]);
});

test("joined PCM can be wrapped as a playable WAV", () => {
  const joined = joinPcm16Chunks([
    Buffer.from([0x00, 0x10, 0x00, 0x20]),
    Buffer.from([0x00, 0x30, 0x00, 0x40]),
  ], { sampleRate: 24000, boundaryPauseMs: 0 });
  const pcm = decodeRawPcm16(joined.buffer, { sampleRate: 24000, channels: 1 });
  const wav = encodePcm16Wav(pcm.channels, pcm.sampleRate);
  const decoded = decodePcmWav(wav);
  assert.equal(decoded.sampleRate, 24000);
  assert.equal(decoded.channelCount, 1);
  assert.equal(decoded.frameCount, 4);
});

test("rejects malformed chunks, invalid pause values and duration overflow", () => {
  assert.throws(() => joinPcm16Chunks([]), /between 1 and 12/);
  assert.throws(() => joinPcm16Chunks([Buffer.from([1])]), /incomplete sample frame/);
  assert.throws(() => joinPcm16Chunks([Buffer.from([1, 0])], { boundaryPauseMs: 501 }), /boundaryPauseMs/);
  assert.throws(() => joinPcm16Chunks([Buffer.from([1, 0])], { sampleRate: 8000, maxDurationSec: 0.0001 }), /exceeds/);
});
