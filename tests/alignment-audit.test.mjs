import test from "node:test";
import assert from "node:assert/strict";
import { auditCharacterAlignment } from "../src/alignment-audit.mjs";

function makeAlignment(text, offset = 0) {
  const characters = Array.from(text);
  return {
    characters,
    character_start_times_seconds: characters.map((_, index) => offset + index * 0.1),
    character_end_times_seconds: characters.map((_, index) => offset + (index + 1) * 0.1),
  };
}

test("prefers raw alignment when it exactly matches the speech text", () => {
  const result = auditCharacterAlignment({
    expectedText: "你好，世界。",
    normalizedAlignment: makeAlignment("ni hao shi jie"),
    alignment: makeAlignment("你好，世界。"),
  });
  assert.equal(result.source, "raw");
  assert.equal(result.exact_text_match, true);
  assert.equal(result.expected_characters, 6);
  assert.equal(result.aligned_characters, 6);
});

test("uses normalized alignment when it is the exact text match", () => {
  const result = auditCharacterAlignment({
    expectedText: "Hello world",
    normalizedAlignment: makeAlignment("Hello world"),
    alignment: makeAlignment("hello world"),
  });
  assert.equal(result.source, "normalized");
  assert.equal(result.exact_text_match, true);
});

test("falls back to available alignment and reports a real mismatch", () => {
  const result = auditCharacterAlignment({
    expectedText: "expected",
    normalizedAlignment: makeAlignment("expanded provider text"),
  });
  assert.equal(result.available, true);
  assert.equal(result.exact_text_match, false);
  assert.ok(result.issues.includes("Aligned character stream differs from the expected speakable text"));
});

test("reports missing alignment without claiming waveform verification", () => {
  const result = auditCharacterAlignment({ expectedText: "hello" });
  assert.equal(result.available, false);
  assert.equal(result.exact_text_match, false);
  assert.match(result.note, /not ASR/);
});
