import test from "node:test";
import assert from "node:assert/strict";
import { createAudioContentBlock, MAX_INLINE_AUDIO_BYTES } from "../src/audio-content.mjs";

test("creates a standard MCP AudioContent block from WAV bytes", () => {
  const input = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x01, 0x02]);
  const block = createAudioContentBlock(input, "audio/wav");
  assert.deepEqual(block, {
    type: "audio",
    data: input.toString("base64"),
    mimeType: "audio/wav",
    annotations: { audience: ["user"], priority: 1 },
  });
});

test("accepts Uint8Array views without including bytes outside the view", () => {
  const backing = new Uint8Array([9, 1, 2, 3, 8]);
  const view = backing.subarray(1, 4);
  const block = createAudioContentBlock(view, "audio/mpeg");
  assert.equal(block.data, Buffer.from([1, 2, 3]).toString("base64"));
  assert.equal(block.mimeType, "audio/mpeg");
});

test("omits inline audio above the response-size threshold", () => {
  assert.equal(createAudioContentBlock(Buffer.alloc(MAX_INLINE_AUDIO_BYTES + 1)), null);
  assert.ok(createAudioContentBlock(Buffer.alloc(MAX_INLINE_AUDIO_BYTES)));
});

test("validates bytes, MIME type, and threshold", () => {
  assert.throws(() => createAudioContentBlock("base64"), /Buffer or Uint8Array/);
  assert.throws(() => createAudioContentBlock(Buffer.from([1]), "application/octet-stream"), /audio\//);
  assert.throws(() => createAudioContentBlock(Buffer.from([1]), "audio/wav", { maxBytes: -1 }), /maxBytes/);
  assert.throws(() => createAudioContentBlock(Buffer.alloc(0)), /cannot be empty/);
});
