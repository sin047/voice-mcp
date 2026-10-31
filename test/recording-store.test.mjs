import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRecordingStore } from "../src/recording-store.mjs";
import { encodePcm16Wav } from "../src/wav-audio.mjs";

function fixtureWav() {
  return encodePcm16Wav([new Float32Array(4410).fill(0.12), new Float32Array(4410).fill(0.12)], 44100);
}

test("recording store persists, lists, retrieves and deletes complete WAV recordings", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-recordings-"));
  const store = createRecordingStore({ directory });
  try {
    const wav = fixtureWav();
    const saved = await store.save({
      buffer: wav,
      text: "A complete test recording",
      performance: "natural",
      language: "ja",
      cues: [{ asset_id: "fx_test", kind: "foley", at_sec: 0.2, duration_sec: 0.5 }],
    });
    assert.match(saved.id, /^rec_[0-9a-f-]{36}$/i);
    assert.equal(saved.durationSec, 0.1);
    assert.equal(saved.text, "A complete test recording");
    assert.equal(saved.cues[0].asset_id, "fx_test");
    assert.equal((await store.list()).length, 1);
    const loaded = await store.get(saved.id);
    assert.deepEqual(loaded.buffer, wav);
    assert.equal(await store.get("../package.json"), null);
    assert.equal(await store.remove(saved.id), true);
    assert.equal(await store.remove(saved.id), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("recording store enforces file, count, total storage and WAV format limits", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "voice-mcp-recordings-"));
  const wav = fixtureWav();
  const store = createRecordingStore({ directory, maxRecordingBytes: wav.length, maxRecordingCount: 1, maxTotalBytes: wav.length });
  try {
    await assert.rejects(() => store.save({ buffer: Buffer.from("not wav") }), /RIFF\/WAVE/);
    await assert.rejects(() => store.save({ buffer: Buffer.alloc(wav.length + 1) }), /file size limit/);
    const saved = await store.save({ buffer: wav });
    await assert.rejects(() => store.save({ buffer: wav }), /archive is full/);
    assert.equal((await store.getUsage()).recordingCount, 1);
    await store.remove(saved.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
