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


test("strips inline audio-tag characters before comparing the spoken text", () => {
  const taggedText = "[heavy ragged breathing]你好。";
  const characters = Array.from(taggedText);
  const result = auditCharacterAlignment({
    expectedText: taggedText,
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, index) => index * 0.05),
      character_end_times_seconds: characters.map((_, index) => (index + 1) * 0.05),
    },
  });
  assert.equal(result.source, "raw");
  assert.equal(result.exact_text_match, true);
  assert.equal(result.expected_characters, 3);
  assert.equal(result.aligned_characters, 3);
  assert.equal(result.raw_aligned_characters, characters.length);
  assert.equal(result.stripped_audio_tag_characters, characters.length - 3);
  assert.deepEqual(result.issues, []);
});

test("selects a tag-stripped exact raw alignment over a normalized mismatch", () => {
  const tagged = "[breathless husky whisper]我还没缓过来。";
  const characters = Array.from(tagged);
  const result = auditCharacterAlignment({
    expectedText: tagged,
    normalizedAlignment: {
      characters: Array.from("provider normalized expansion"),
      character_start_times_seconds: Array.from({length: 30}, (_, i) => i * 0.1),
      character_end_times_seconds: Array.from({length: 30}, (_, i) => (i + 1) * 0.1),
    },
    alignment: {
      characters,
      character_start_times_seconds: characters.map((_, i) => i * 0.04),
      character_end_times_seconds: characters.map((_, i) => (i + 1) * 0.04),
    },
  });
  assert.equal(result.source, "raw");
  assert.equal(result.exact_text_match, true);
  assert.equal(result.monotonic_timestamps, true);
});

test("reports missing alignment without claiming waveform verification", () => {
  const result = auditCharacterAlignment({ expectedText: "hello" });
  assert.equal(result.available, false);
  assert.equal(result.exact_text_match, false);
  assert.match(result.note, /not ASR/);
});
