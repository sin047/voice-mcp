import test from "node:test";
import assert from "node:assert/strict";
import {
  listVocalPerformancePresets,
  planVocalPreset,
  VOCAL_PRESET_IDS,
} from "../src/vocal-performance-presets.mjs";

test("lists reusable presets without TTS calls and excludes unverified candidates", () => {
  const catalog = listVocalPerformancePresets();
  assert.equal(catalog.plan_only, true);
  assert.equal(catalog.estimated_tts_calls, 0);
  assert.deepEqual(VOCAL_PRESET_IDS, [
    "close_soft",
    "heavy_breathing",
    "breathless_dialogue",
    "ragged_release",
    "breathing_to_dialogue",
    "afterglow",
  ]);
  assert.deepEqual(catalog.presets.map((preset) => preset.id), VOCAL_PRESET_IDS);
  const cues = catalog.presets.flatMap((preset) => preset.slots.map((slot) => slot.cue).filter(Boolean));
  assert.equal(cues.includes("warm_exhale"), false);
  assert.equal(cues.includes("wet_squelch"), false);
  assert.equal(cues.includes("deep_wet_kiss"), false);
});

test("plans the positively auditioned close-soft combination on separate phrase beats", () => {
  const plan = planVocalPreset({
    text: "先靠近一点。再听我说。",
    preset: "close_soft",
    anchors: [
      { slot: "inhale", anchor_text: "先靠近一点" },
      { slot: "whisper", anchor_text: "再听我说" },
    ],
  });
  assert.equal(plan.estimated_tts_calls, 0);
  assert.equal(plan.preset_validation_status, "positive_combined_audition");
  assert.equal(
    plan.rendered_text,
    "[soft shuddering inhale]\n先靠近一点。\n[intense close-up whisper against ear]\n再听我说。",
  );
  assert.deepEqual(plan.cues.map((cue) => cue.cue), ["soft_inhale", "close_whisper"]);
});

test("keeps sustained heavy breathing distinct from breathless spoken delivery", () => {
  const plan = planVocalPreset({
    text: "让我先缓一会儿。",
    preset: "heavy_breathing",
    anchors: [{ slot: "breathing", anchor_text: "让我先缓一会儿" }],
  });
  assert.equal(plan.rendered_text, "让我先缓一会儿。\n[heavy ragged breathing]");
  assert.deepEqual(plan.cues.map((cue) => cue.cue), ["heavy_ragged_breathing"]);
});

test("plans breathless husky whisper as a spoken-line state, not a breath clip", () => {
  const plan = planVocalPreset({
    text: "我还没完全缓过来。",
    preset: "breathless_dialogue",
    anchors: [{ slot: "dialogue", anchor_text: "我还没完全缓过来" }],
  });
  assert.equal(plan.rendered_text, "[breathless husky whisper] 我还没完全缓过来。");
  assert.deepEqual(plan.cues.map((cue) => cue.cue), ["breathless_husky_whisper"]);
});

test("plans the breathing-to-dialogue sequence and flags the untested combination", () => {
  const plan = planVocalPreset({
    text: "等我缓一口气。\n再听我说。",
    preset: "breathing_to_dialogue",
    anchors: [
      { slot: "breathing", anchor_text: "等我缓一口气" },
      { slot: "dialogue", anchor_text: "再听我说" },
    ],
  });
  assert.equal(plan.preset_validation_status, "composition_not_yet_auditioned");
  assert.equal(plan.rendered_text, "[heavy ragged breathing]\n等我缓一口气。\n[breathless husky whisper] 再听我说。");
  assert.equal(plan.warnings.length, 1);
});

test("keeps the Afterglow closing line untagged and does not append warm_exhale", () => {
  const plan = planVocalPreset({
    text: "先让我缓一会儿。\n我还在喘。\n现在好多了。",
    preset: "afterglow",
    anchors: [
      { slot: "breathing", anchor_text: "先让我缓一会儿" },
      { slot: "breathless_dialogue", anchor_text: "我还在喘" },
      { slot: "closing_line", anchor_text: "现在好多了" },
    ],
  });
  assert.equal(plan.preset_validation_status, "arrangement_guidance_only");
  assert.equal(
    plan.rendered_text,
    "[heavy ragged breathing]\n先让我缓一会儿。\n[breathless husky whisper] 我还在喘。\n现在好多了。",
  );
  assert.equal(plan.slots.at(-1).is_untagged, true);
  assert.equal(plan.slots.at(-1).tag, null);
  assert.equal(plan.rendered_text.includes("[warm exhale]"), false);
});

test("allows a lighter Afterglow variant with one optional cue and an untagged closing line", () => {
  const plan = planVocalPreset({
    text: "我还在喘。\n现在好多了。",
    preset: "afterglow",
    anchors: [
      { slot: "breathless_dialogue", anchor_text: "我还在喘" },
      { slot: "closing_line", anchor_text: "现在好多了" },
    ],
  });
  assert.equal(plan.cue_count, 1);
  assert.equal(plan.slots.length, 2);
});

test("rejects unknown presets, missing required slots, duplicate slots and unknown slots", () => {
  assert.throws(() => planVocalPreset({
    text: "台词。",
    preset: "unknown",
    anchors: [{ slot: "dialogue", anchor_text: "台词" }],
  }), /Unsupported vocal preset/);

  assert.throws(() => planVocalPreset({
    text: "先靠近。再听我说。",
    preset: "close_soft",
    anchors: [{ slot: "inhale", anchor_text: "先靠近" }],
  }), /Missing required preset slot: whisper/);

  assert.throws(() => planVocalPreset({
    text: "先靠近。再听我说。",
    preset: "close_soft",
    anchors: [
      { slot: "inhale", anchor_text: "先靠近" },
      { slot: "inhale", anchor_text: "再听我说" },
    ],
  }), /Duplicate preset slot/);

  assert.throws(() => planVocalPreset({
    text: "我还没缓过来。",
    preset: "breathless_dialogue",
    anchors: [{ slot: "unknown", anchor_text: "我还没缓过来" }],
  }), /Unknown slot/);
});

test("rejects out-of-order, overlapping and missing exact anchors", () => {
  assert.throws(() => planVocalPreset({
    text: "先停一下。再说话。",
    preset: "breathing_to_dialogue",
    anchors: [
      { slot: "dialogue", anchor_text: "再说话" },
      { slot: "breathing", anchor_text: "先停一下" },
    ],
  }), /defined slot order/);

  assert.throws(() => planVocalPreset({
    text: "同一句话。",
    preset: "close_soft",
    anchors: [
      { slot: "inhale", anchor_text: "同一句话" },
      { slot: "whisper", anchor_text: "同一句话" },
    ],
  }), /distinct, non-overlapping phrases/);

  assert.throws(() => planVocalPreset({
    text: "只有这一句。",
    preset: "heavy_breathing",
    anchors: [{ slot: "breathing", anchor_text: "不存在" }],
  }), /not found exactly/);
});

test("Afterglow requires an untagged closing line and at least one selected vocal cue", () => {
  assert.throws(() => planVocalPreset({
    text: "我还在喘。",
    preset: "afterglow",
    anchors: [{ slot: "breathing", anchor_text: "我还在喘" }],
  }), /Missing required preset slot: closing_line/);

  assert.throws(() => planVocalPreset({
    text: "现在好多了。",
    preset: "afterglow",
    anchors: [{ slot: "closing_line", anchor_text: "现在好多了" }],
  }), /needs at least 1 vocal cue slot/);
});
