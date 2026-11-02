import test from "node:test";
import assert from "node:assert/strict";
import { planSceneDirector } from "../src/scene-director.mjs";

test("scene director defaults to the TTS-first hybrid breath mode", () => {
  const plan = planSceneDirector({
    text: "你好。",
    beats: [{ text: "你好。" }],
  });
  assert.equal(plan.breath_mode, "hybrid");
  assert.equal(plan.render_request.breath_mode, "hybrid");
  assert.equal(plan.estimated_tts_calls, 0);
});

test("scene director allows an explicit legacy breath mode override", () => {
  const plan = planSceneDirector({
    text: "你好。",
    beats: [{ text: "你好。" }],
    breathMode: "off",
  });
  assert.equal(plan.breath_mode, "off");
  assert.equal(plan.render_request.breath_mode, "off");
});

test("scene director rejects unknown breath modes before rendering", () => {
  assert.throws(() => planSceneDirector({
    text: "你好。",
    beats: [{ text: "你好。" }],
    breathMode: "automatic",
  }), /breathMode must be off, natural, enhanced, or hybrid/);
});
