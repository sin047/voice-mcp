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
      /kind must be ambience or foley/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
