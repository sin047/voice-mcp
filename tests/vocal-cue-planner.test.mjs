import test from "node:test";
import assert from "node:assert/strict";
import { planVocalCues, VOCAL_CUE_TYPES } from "../src/vocal-cue-planner.mjs";

test("places a close whisper tag on its own line before an exact phrase", () => {
  const text = "我停了一下。然后靠近你。";
  const plan = planVocalCues({
    text,
    cues: [{ cue: "close_whisper", anchor_text: "然后靠近你" }],
  });
  assert.equal(plan.rendered_text, "我停了一下。\n[intense close-up whisper against ear]\n然后靠近你。");
  assert.equal(plan.estimated_tts_calls, 0);
  assert.equal(plan.plan_only, true);
  assert.equal(plan.cues[0].label_zh, "贴近耳边低语");
  assert.equal(plan.cues[0].validation_status, "reference_candidate_unverified");
});

test("keeps a tag and explicit vocalization inline on the same line", () => {
  const plan = planVocalCues({
    text: "嗯，过来。",
    cues: [{ cue: "soft_inhale", anchor_text: "过来", layout: "inline", vocalization: "はっ" }],
  });
  assert.equal(plan.rendered_text, "嗯，[soft shuddering inhale] はっ 过来。");
});

test("places an after-cue after closing punctuation and before the next phrase", () => {
  const plan = planVocalCues({
    text: "我停了一下。继续。",
    cues: [{ cue: "heavy_ragged_breathing", anchor_text: "我停了一下", placement: "after" }],
  });
  assert.equal(plan.rendered_text, "我停了一下。\n[heavy ragged breathing]\n继续。");
});

test("selects a repeated phrase occurrence exactly", () => {
  const plan = planVocalCues({
    text: "停一下，再停一下，然后继续。",
    cues: [{ cue: "soft_inhale", anchor_text: "停一下", occurrence: 2, layout: "inline" }],
  });
  assert.equal(plan.cues[0].occurrence, 2);
  assert.equal(plan.cues[0].start, 5);
  assert.equal(plan.rendered_text, "停一下，再[soft shuddering inhale] 停一下，然后继续。");
});

test("groups a voice cue and a breath cue at the same phrase without duplicating lines", () => {
  const plan = planVocalCues({
    text: "靠近一点。",
    cues: [
      { cue: "close_whisper", anchor_text: "靠近一点" },
      { cue: "heavy_ragged_breathing", anchor_text: "靠近一点" },
    ],
  });
  assert.equal(plan.rendered_text, "[intense close-up whisper against ear] [heavy ragged breathing]\n靠近一点。");
  assert.equal(plan.cue_count, 2);
});

test("preserves CRLF input when inserting line-layout cues", () => {
  const plan = planVocalCues({
    text: "前一句。\r\n下一句。",
    cues: [{ cue: "warm_exhale", anchor_text: "下一句" }],
  });
  assert.equal(plan.rendered_text, "前一句。\r\n[warm exhale]\r\n下一句。");
});

test("supports all reference-derived cue identifiers", () => {
  assert.deepEqual(VOCAL_CUE_TYPES, [
    "soft_inhale",
    "heavy_ragged_breathing",
    "ragged_exhale",
    "warm_exhale",
    "close_whisper",
    "husky_low_whisper",
    "breathless_husky_whisper",
    "gentle_growl",
    "deep_wet_kiss",
    "wet_licking",
    "wet_sucking",
    "wet_squelch",
    "sticky_parting",
    "swallowing_hard",
    "lower_lip_suck",
    "neck_bite",
  ]);
});

test("does not infer cues from suggestive wording", () => {
  assert.throws(() => planVocalCues({
    text: "急促呼吸，靠近耳边低语。",
    cues: [],
  }), /between 1 and 16 explicit vocal cues/);
});

test("rejects missing and out-of-order exact anchors", () => {
  assert.throws(() => planVocalCues({
    text: "我说完了。",
    cues: [{ cue: "soft_inhale", anchor_text: "没有这句话" }],
  }), /not found exactly/);

  assert.throws(() => planVocalCues({
    text: "先靠近，再低语。",
    cues: [
      { cue: "close_whisper", anchor_text: "低语", layout: "inline" },
      { cue: "soft_inhale", anchor_text: "先靠近", layout: "inline" },
    ],
  }), /spoken-text order/);
});

test("rejects ambiguous mid-phrase line breaks and supports inline layout instead", () => {
  assert.throws(() => planVocalCues({
    text: "我想靠近你一点。",
    cues: [{ cue: "close_whisper", anchor_text: "靠近你" }],
  }), /phrase boundary/);

  const inline = planVocalCues({
    text: "我想靠近你一点。",
    cues: [{ cue: "close_whisper", anchor_text: "靠近你", layout: "inline" }],
  });
  assert.equal(inline.rendered_text, "我想[intense close-up whisper against ear] 靠近你一点。");
});

test("rejects duplicate tags, invalid vocalizations and unsupported cue names", () => {
  assert.throws(() => planVocalCues({
    text: "靠近一点。",
    cues: [
      { cue: "soft_inhale", anchor_text: "靠近一点" },
      { cue: "soft_inhale", anchor_text: "靠近一点" },
    ],
  }), /Duplicate vocal cue/);

  assert.throws(() => planVocalCues({
    text: "靠近一点。",
    cues: [{ cue: "soft_inhale", anchor_text: "靠近一点", vocalization: "[inhales]" }],
  }), /without brackets/);

  assert.throws(() => planVocalCues({
    text: "靠近一点。",
    cues: [{ cue: "unknown", anchor_text: "靠近一点" }],
  }), /Unsupported vocal cue/);
});

test("warns when too many tags are stacked on one phrase", () => {
  const plan = planVocalCues({
    text: "靠近一点。",
    cues: [
      { cue: "close_whisper", anchor_text: "靠近一点" },
      { cue: "soft_inhale", anchor_text: "靠近一点" },
      { cue: "warm_exhale", anchor_text: "靠近一点" },
    ],
  });
  assert.equal(plan.warnings.length, 1);
});
