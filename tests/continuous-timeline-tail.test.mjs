import test from "node:test";
import assert from "node:assert/strict";
import { decodePcmWav, encodePcm16Wav, mixSoundscape } from "../src/wav-audio.mjs";

test("continuous voice timeline can carry a pure Foley tail after speech ends", () => {
  const sampleRate = 24000;
  const voice = {
    sampleRate,
    channels: [new Float32Array(sampleRate / 2).fill(0.08)],
    durationSec: 0.5,
  };
  const foleyAsset = encodePcm16Wav(
    [new Float32Array(sampleRate).fill(0.2)],
    sampleRate,
  );

  const mixed = mixSoundscape({
    voicePcm: voice,
    totalDurationSec: 1.5,
    assets: new Map([["fx_test", foleyAsset]]),
    cues: [{
      fileId: "fx_test",
      kind: "foley",
      atSec: 0.75,
      durationSec: 0.5,
      gain: 0.5,
      pan: 0,
      distanceMeters: 1,
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: false,
    }],
    voiceGain: 1,
    ambienceBusGain: 1,
    foleyBusGain: 1,
    masterGain: 1,
    duckingEnabled: false,
  });

  const decoded = decodePcmWav(mixed.buffer);
  assert.equal(mixed.durationSec, 1.5);
  assert.equal(decoded.sampleRate, 44100);
  assert.equal(decoded.channelCount, 2);
  assert.equal(decoded.frameCount, Math.round(44100 * 1.5));

  const outputRate = decoded.sampleRate;
  const tailStart = Math.round(outputRate * 0.8);
  const tailEnd = Math.round(outputRate * 1.2);
  const tailPeak = Math.max(
    ...decoded.channels.map(channel =>
      channel.slice(tailStart, tailEnd).reduce((peak, value) => Math.max(peak, Math.abs(value)), 0)
    )
  );
  assert.ok(tailPeak > 0.01, "Foley should remain audible after the voice has ended");

  const afterCue = Math.round(outputRate * 1.3);
  const afterCuePeak = Math.max(
    ...decoded.channels.map(channel =>
      channel.slice(afterCue).reduce((peak, value) => Math.max(peak, Math.abs(value)), 0)
    )
  );
  assert.equal(afterCuePeak, 0, "the pure-Foley tail should end at its cue boundary");
});
