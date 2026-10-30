import test from "node:test";
import assert from "node:assert/strict";
import {
  decodePcmWav,
  decodeRawPcm16,
  encodePcm16Wav,
  mixSoundscape,
  resampleChannels,
} from "../src/wav-audio.mjs";

function rawPcm(samples) {
  const buffer = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => {
    const value = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(value < 0 ? Math.round(value * 32768) : Math.round(value * 32767), index * 2);
  });
  return buffer;
}

function tone(frames, value) {
  return new Float32Array(frames).fill(value);
}

test("encodes and decodes mono and stereo PCM WAV assets", () => {
  const mono = tone(100, 0.25);
  const monoWav = encodePcm16Wav([mono], 22050);
  const decodedMono = decodePcmWav(monoWav);
  assert.equal(decodedMono.channelCount, 1);
  assert.equal(decodedMono.sampleRate, 22050);
  assert.equal(decodedMono.frameCount, 100);
  assert.ok(Math.abs(decodedMono.channels[0][50] - 0.25) < 0.001);

  const stereoWav = encodePcm16Wav([tone(80, -0.2), tone(80, 0.4)], 44100);
  const decodedStereo = decodePcmWav(stereoWav);
  assert.equal(decodedStereo.channelCount, 2);
  assert.ok(Math.abs(decodedStereo.channels[0][20] + 0.2) < 0.001);
  assert.ok(Math.abs(decodedStereo.channels[1][20] - 0.4) < 0.001);
});

test("rejects malformed or unsupported WAV input", () => {
  assert.throws(() => decodePcmWav(Buffer.from("not audio")), /RIFF\/WAVE/);
  const wav = encodePcm16Wav([tone(10, 0.1)], 44100);
  const unsupported = Buffer.from(wav);
  unsupported.writeUInt16LE(24, 34);
  assert.throws(() => decodePcmWav(unsupported), /16-bit PCM or 32-bit float/);
});

test("decodes raw PCM and linearly resamples audio channels", () => {
  const pcm = decodeRawPcm16(rawPcm([0, 0.5, -0.5, 0.25]), { sampleRate: 22050, channels: 1 });
  assert.equal(pcm.frameCount, 4);
  assert.ok(Math.abs(pcm.channels[0][1] - 0.5) < 0.001);
  const resampled = resampleChannels(pcm.channels, 22050, 44100);
  assert.equal(resampled[0].length, 8);
  assert.ok(Math.abs(resampled[0][2] - 0.5) < 0.001);
});

test("mixes a centered voice with a timed mono effect and preserves stereo pan", () => {
  const voice = rawPcm(tone(44100, 0.1));
  const effect = encodePcm16Wav([tone(4410, 0.5)], 22050);
  const mixed = mixSoundscape({
    voicePcm: voice,
    assets: new Map([["fx_left", effect]]),
    cues: [{
      fileId: "fx_left",
      kind: "foley",
      atSec: 0.5,
      gain: 0.7,
      pan: -1,
      distanceMeters: 1.5,
      fadeInSec: 0,
      fadeOutSec: 0,
    }],
    voiceGain: 1,
    ambienceBusGain: 1,
    foleyBusGain: 1,
    masterGain: 1,
    duckingEnabled: false,
  });

  const output = decodePcmWav(mixed.buffer);
  assert.equal(output.channelCount, 2);
  assert.equal(output.sampleRate, 44100);
  assert.equal(output.frameCount, 44100);
  assert.ok(output.channels[0][22050] > output.channels[1][22050] + 0.2);
  assert.ok(Math.abs(output.channels[0][100] - output.channels[1][100]) < 0.001);
});

test("loops ambience, applies ducking and protects the output peak", () => {
  const voiceSamples = new Float32Array(44100);
  voiceSamples.fill(0.99, 0, 22050);
  const voice = rawPcm(voiceSamples);
  const ambience = encodePcm16Wav([tone(4410, 0.5)], 44100);

  const mixed = mixSoundscape({
    voicePcm: voice,
    assets: new Map([["room", ambience]]),
    cues: [{
      fileId: "room",
      kind: "ambience",
      atSec: 0,
      gain: 0.7,
      loop: true,
      fadeInSec: 0,
      fadeOutSec: 0,
    }],
    voiceGain: 1,
    ambienceBusGain: 1,
    foleyBusGain: 1,
    masterGain: 1,
    duckingEnabled: true,
    duckingAmount: 1,
  });

  const output = decodePcmWav(mixed.buffer);
  assert.ok(mixed.limiterGain < 1);
  const earlyAmbience = output.channels[0][1000];
  const quietTail = output.channels[0][33000];
  assert.ok(Number.isFinite(earlyAmbience));
  assert.ok(Number.isFinite(quietTail));
  assert.ok(Math.max(...output.channels[0].slice(0, 44100).filter((_, i) => i % 100 === 0).map(Math.abs)) <= 0.981);
});

test("quiet stereo rain ambience is clearly present while the voice stays in front", () => {
  const voice = rawPcm(tone(44100 * 3, 0.1));
  const rain = encodePcm16Wav([tone(44100, 0.025), tone(44100, -0.025)], 44100);
  const mixed = mixSoundscape({
    voicePcm: voice,
    assets: new Map([["rain", rain]]),
    cues: [{
      fileId: "rain",
      kind: "ambience",
      atSec: 0,
      gain: 0.4,
      pan: 0,
      distanceMeters: 2.4,
      fadeInSec: 0,
      fadeOutSec: 0,
      loop: true,
    }],
    voiceGain: 1,
    ambienceBusGain: 0.82,
    masterGain: 0.9,
    duckingEnabled: false,
  });

  const audio = decodePcmWav(mixed.buffer);
  const frame = 22050;
  const channelDifference = audio.channels[0][frame] - audio.channels[1][frame];
  assert.ok(channelDifference > 0.04, "the quiet rain bed must be audible in the stereo result");
  assert.ok(channelDifference < 0.12, "the rain bed must not overpower the voice");
  assert.equal(audio.channelCount, 2);
});

test("rejects a soundscape longer than the supported duration", () => {
  const voice = rawPcm(tone(44100 * 181, 0.01));
  assert.throws(() => mixSoundscape({ voicePcm: voice, assets: new Map() }), /180 second/);
});
