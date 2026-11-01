import test from "node:test";
import assert from "node:assert/strict";
import { resolveCueTimeAfterText } from "../src/alignment-cues.mjs";

const alignment = {
  characters: ["H", "e", "l", "l", "o", " ", "w", "o", "r", "l", "d"],
  character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
};

test("resolves a cue immediately after an exact phrase", () => {
  assert.equal(resolveCueTimeAfterText({ alignment, afterText: "Hello" }), 0.5);
});

test("supports selecting a repeated phrase occurrence", () => {
  const repeated = {
    characters: ["y", "e", "s", " ", "y", "e", "s"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7],
  };
  assert.equal(resolveCueTimeAfterText({ alignment: repeated, afterText: "yes", occurrence: 2 }), 0.7);
});

test("rejects an anchor that is not present", () => {
  assert.throws(() => resolveCueTimeAfterText({ alignment, afterText: "missing" }), /not found/);
});

test("rejects missing or mismatched alignment arrays", () => {
  assert.throws(() => resolveCueTimeAfterText({ afterText: "Hello" }), /usable character-level alignment/);
  assert.throws(() => resolveCueTimeAfterText({
    alignment: { characters: ["a"], character_start_times_seconds: [], character_end_times_seconds: [0.1] },
    afterText: "a",
  }), /usable character-level alignment/);
});

test("prefers the alignment matching the exact speech text", () => {
  const expanded = {
    characters: ["H", "e", "l", "l", "o", " ", "w", "o", "r", "l", "d", "!"],
    character_start_times_seconds: Array.from({ length: 12 }, (_, i) => 10 + i * 0.1),
    character_end_times_seconds: Array.from({ length: 12 }, (_, i) => 10.1 + i * 0.1),
  };
  assert.equal(resolveCueTimeAfterText({
    normalizedAlignment: expanded,
    alignment,
    expectedText: "Hello world",
    afterText: "Hello",
  }), 0.5);
});
