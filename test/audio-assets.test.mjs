import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createAudioAssetStore } from "../src/audio-assets.mjs";
import { encodePcm16Wav } from "../src/wav-audio.mjs";

function fixtureWav() {
  return encodePcm16Wav([new Float32Array(4410).fill(0.15)], 44100);
}

test("audio asset store saves, lists, reads and deletes safe WAV assets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-assets-"));
  const store = createAudioAssetStore({ directory });
  try {
    const saved = await store.save({
      buffer: fixtureWav(),
      name: "../../private/room ambience.wav",
      kind: "ambience",
    });

    assert.match(saved.id, /^fx_[0-9a-f-]{36}$/i);
    assert.equal(saved.name, "room ambience.wav");
    assert.equal(saved.kind, "ambience");
    assert.equal(saved.durationSec, 0.1);
    assert.equal((await store.list()).length, 1);

    const loaded = await store.get(saved.id);
    assert.equal(loaded.metadata.id, saved.id);
    assert.deepEqual(loaded.buffer, fixtureWav());

    assert.deepEqual(await store.get("../package.json"), null);
    assert.equal(await store.remove(saved.id), true);
    assert.equal(await store.remove(saved.id), false);
    assert.equal((await store.list()).length, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audio asset store enforces file, count, total storage and format limits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-assets-"));
  const wav = fixtureWav();
  const store = createAudioAssetStore({
    directory,
    maxAssetBytes: wav.length,
    maxAssetCount: 1,
    maxTotalBytes: wav.length,
  });
  try {
    await assert.rejects(() => store.save({ buffer: Buffer.from("not wav") }), /RIFF\/WAVE/);
    await assert.rejects(() => store.save({ buffer: Buffer.alloc(wav.length + 1) }), /file size limit/);

    const saved = await store.save({ buffer: wav, name: "one.wav" });
    assert.equal((await store.getUsage()).assetCount, 1);
    await assert.rejects(() => store.save({ buffer: wav, name: "two.wav" }), /library is full/);
    await store.remove(saved.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audio asset store rejects unsupported effect categories", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-assets-"));
  const store = createAudioAssetStore({ directory });
  try {
    await assert.rejects(
      () => store.save({ buffer: fixtureWav(), kind: "remote" }),
      /kind must be ambience, foley, or breath/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});


test("audio asset store keeps breath clips pending until explicitly approved", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-breath-assets-"));
  const store = createAudioAssetStore({ directory });
  try {
    const samples = new Float32Array(Math.round(0.3 * 44100));
    for (let i = 0; i < samples.length; i += 1) samples[i] = 0.04 * Math.sin(2 * Math.PI * 800 * i / 44100);
    const saved = await store.save({
      buffer: encodePcm16Wav([samples], 44100),
      name: "favorite-inhale.wav",
      kind: "breath",
      breathType: "inhale",
      sourceRecordingId: "rec_00000000-0000-0000-0000-000000000001",
      sourceStartSec: 1.2,
      sourceEndSec: 1.5,
      rms: 0.028,
      peak: 0.04,
    });
    assert.equal(saved.kind, "breath");
    assert.equal(saved.breathType, "inhale");
    assert.equal(saved.status, "pending");
    assert.equal(saved.sourceRecordingId, "rec_00000000-0000-0000-0000-000000000001");
    assert.equal((await store.list()).length, 1);

    const approved = await store.update(saved.id, { status: "approved" });
    assert.equal(approved.status, "approved");
    const loaded = await store.get(saved.id);
    assert.equal(loaded.metadata.status, "approved");

    await assert.rejects(() => store.update(saved.id, { kind: "foley" }), /Unsupported/);
    await assert.rejects(() => store.update(saved.id, { status: "ready" }), /status must be/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("audio asset store validates breath type and the reference clip duration window", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-breath-assets-"));
  const store = createAudioAssetStore({ directory });
  try {
    const short = encodePcm16Wav([new Float32Array(Math.round(0.15 * 44100)).fill(0.02)], 44100);
    const valid = encodePcm16Wav([new Float32Array(Math.round(0.3 * 44100)).fill(0.02)], 44100);
    await assert.rejects(() => store.save({ buffer: valid, kind: "breath" }), /breathType inhale or exhale/);
    await assert.rejects(() => store.save({ buffer: short, kind: "breath", breathType: "inhale" }), /0.22 and 1.1 seconds/);
    await assert.rejects(() => store.save({
      buffer: valid, kind: "breath", breathType: "sigh",
    }), /breathType inhale or exhale/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
