import test from "node:test";
import assert from "node:assert/strict";
import { planVoiceChunks } from "../src/voice-chunker.mjs";
import { auditCharacterAlignment } from "../src/alignment-audit.mjs";

test("chunks long text at sentence boundaries and reconstructs it exactly", () => {
  const text = Array.from({ length: 18 }, (_, i) => `第${i + 1}句，慢慢说完这一句话。`).join("");
  const plan = planVoiceChunks(text, { targetChars: 100, maxChars: 120 });
  assert.ok(plan.chunk_count > 1);
  assert.equal(plan.reconstruction_exact, true);
  assert.equal(plan.chunks.map(chunk => chunk.text).join(""), text);
  assert.ok(plan.chunks.every(chunk => chunk.character_count <= 120));
});

test("hard-splits a long sentence without dropping code points", () => {
  const text = "这是一段没有句号的连续文本".repeat(35);
  const plan = planVoiceChunks(text, { targetChars: 100, maxChars: 120 });
  assert.equal(plan.reconstruction_exact, true);
  assert.ok(plan.chunks.every(chunk => chunk.character_count <= 120));
});

test("provides bounded adjacent context without overlapping chunk audio", () => {
  const text = "第一段内容。".repeat(30);
  const plan = planVoiceChunks(text, { targetChars: 100, maxChars: 120, contextChars: 20 });
  assert.ok(plan.chunks.length > 1);
  assert.ok(plan.chunks[0].next_text.length <= 20);
  assert.equal(plan.chunks[0].previous_text, undefined);
  assert.equal(plan.chunks.at(-1).next_text, undefined);
  assert.equal(plan.context_mode, "previous_text_next_text_no_audio_overlap");
});

test("rejects invalid chunk limits and non-speakable text", () => {
  assert.throws(() => planVoiceChunks("你好", { targetChars: 90 }), /targetChars/);
  assert.throws(() => planVoiceChunks("你好", { targetChars: 100, maxChars: 90 }), /maxChars/);
  assert.throws(() => planVoiceChunks("……"));
});

test("audits exact aligned text and monotonic timestamps", () => {
  const alignment = {
    characters: ["你", "好"],
    character_start_times_seconds: [0, 0.1],
    character_end_times_seconds: [0.1, 0.2],
  };
  const result = auditCharacterAlignment({ expectedText: "你好", alignment });
  assert.equal(result.available, true);
  assert.equal(result.exact_text_match, true);
  assert.equal(result.monotonic_timestamps, true);
  assert.deepEqual(result.issues, []);
});

test("reports text mismatch and bad timestamps without blocking", () => {
  const alignment = {
    characters: ["你"],
    character_start_times_seconds: [0.2],
    character_end_times_seconds: [0.1],
  };
  const result = auditCharacterAlignment({ expectedText: "你好", alignment });
  assert.equal(result.available, true);
  assert.equal(result.exact_text_match, false);
  assert.equal(result.monotonic_timestamps, false);
  assert.equal(result.issues.length, 2);
});

test("reports unavailable alignment as a diagnostic, not an exception", () => {
  const result = auditCharacterAlignment({ expectedText: "hello" });
  assert.equal(result.available, false);
  assert.equal(result.issues.length, 1);
});
