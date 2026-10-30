import test from "node:test";
import assert from "node:assert/strict";
import { SOUNDSCAPE_LEVELS, soundscapeGain } from "../src/soundscape-levels.mjs";

test("the approved rain gain remains our background reference", () => {
  assert.equal(SOUNDSCAPE_LEVELS.background.gain, 0.48);
  assert.equal(soundscapeGain("background"), 0.48);
});

test("contact is louder than approach and background object details", () => {
  assert.equal(soundscapeGain("contact"), 0.54);
  assert.equal(soundscapeGain("detail"), 0.46);
  assert.ok(soundscapeGain("contact") > soundscapeGain("approach"));
  assert.ok(soundscapeGain("approach") > soundscapeGain("action"));
  assert.ok(soundscapeGain("contact") > 0.46, "cloth gets a modest boost after the listening test");
});

test("per-asset trims stay within cue gain limits", () => {
  assert.equal(soundscapeGain("action", -1.4), 0.17);
  assert.equal(soundscapeGain("layered", -2.5), 0.09);
  assert.equal(soundscapeGain("contact", 12), 0.7);
  assert.throws(() => soundscapeGain("unknown"), /Unsupported/);
  assert.throws(() => soundscapeGain("contact", 13), /between/);
  assert.throws(() => soundscapeGain("contact", Number.NaN), /between/);
});
