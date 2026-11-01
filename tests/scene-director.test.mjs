import test from "node:test";
import assert from "node:assert/strict";
import {
  insertTimelinePauses,
  planSceneDirector,
  resolveScenePauses,
  shiftCueTimeForPauses,
} from "../src/scene-director.mjs";

const assets = [
  { id: "fx_clothing", name: "03_衣物摩擦_双耳.wav", kind: "foley", durationSec: 33.901 },
  { id: "fx_penetration_basic", name: "抽插_基础节奏.wav", kind: "foley", durationSec: 37.709 },
  { id: "fx_penetration_crisp", name: "抽插_清脆弹响.wav", kind: "foley", durationSec: 44.188 },
  { id: "fx_penetration_intense", name: "抽插_高强度密集.wav", kind: "foley", durationSec: 32.496 },
  { id: "fx_finish", name: "10_收尾音效_双耳.wav", kind: "foley", durationSec: 16.881 },
  { id: "fx_rain", name: "01_雨声_双耳.wav", kind: "ambience", durationSec: 85.667 },
];

test("composes different vocal presets across exact scene beats without TTS calls", () => {
  const text = "等我一下……\n我还没完全缓过来。\n现在好多了。";
  const plan = planSceneDirector({
    text,
    beats: [
      {
        id: "breathing",
        text: "等我一下……\n",
        vocal_preset: "heavy_breathing",
        anchors: [{ slot: "breathing", anchor_text: "等我一下" }],
        pause_after_text: "等我一下",
        pause_after_ms: 350,
      },
      {
        id: "dialogue",
        text: "我还没完全缓过来。\n",
        vocal_preset: "breathless_dialogue",
        anchors: [{ slot: "dialogue", anchor_text: "我还没完全缓过来" }],
      },
      { id: "closing", text: "现在好多了。" },
    ],
    assets,
  });

  assert.equal(plan.plan_only, true);
  assert.equal(plan.estimated_tts_calls, 0);
  assert.equal(plan.raw_tags, true);
  assert.equal(plan.beat_count, 3);
  assert.equal(plan.pause_total_ms, 350);
  assert.match(plan.rendered_text, /\[heavy ragged breathing\]/);
  assert.match(plan.rendered_text, /\[breathless husky whisper\]/);
  assert.match(plan.rendered_text, /现在好多了。$/);
  assert.equal(plan.render_request.raw_tags, true);
  assert.equal(plan.render_request.pauses.length, 1);
});

test("combines a selected ambience bed and one explicit Foley action", () => {
  const text = "我轻轻说完，然后衣物摩擦响起。";
  const plan = planSceneDirector({
    text,
    beats: [{ id: "scene", text }],
    foleyActions: [{ action: "clothing_rustle", after_text: "衣物摩擦响起" }],
    ambiencePreset: "rain",
    assets,
    tailDurationSec: 2,
  });

  assert.equal(plan.ambience_preset, "rain");
  assert.equal(plan.ambience_cue_count, 1);
  assert.equal(plan.foley_action_count, 1);
  assert.equal(plan.foley_action_labels[0].label_zh, "衣物摩擦");
  assert.equal(plan.cues.length, 2);
  assert.equal(plan.cues[0].kind, "ambience");
  assert.equal(plan.cues[1].kind, "foley");
  assert.equal(plan.render_request.sequence_foley, true);
  assert.equal(plan.render_request.tail_duration_sec, 2);
});

test("passes each explicit rhythm variant and the selected ending action through Scene Director", () => {
  const text = "基础节奏。清脆弹响。高强度密集。射精收尾。";
  const plan = planSceneDirector({
    text,
    beats: [{ id: "actions", text }],
    foleyActions: [
      { action: "penetration_basic", after_text: "基础节奏" },
      { action: "penetration_crisp", after_text: "清脆弹响" },
      { action: "penetration_intense", after_text: "高强度密集" },
      { action: "cumshot", after_text: "射精收尾" },
    ],
    assets,
  });
  assert.deepEqual(plan.cues.map((cue) => cue.asset_id), [
    "fx_penetration_basic",
    "fx_penetration_crisp",
    "fx_penetration_intense",
    "fx_finish",
  ]);
  assert.deepEqual(plan.foley_action_labels.map((item) => item.action), [
    "penetration_basic",
    "penetration_crisp",
    "penetration_intense",
    "cumshot",
  ]);
  assert.equal(plan.render_request.sequence_foley, true);
  assert.equal(plan.estimated_tts_calls, 0);
});

test("keeps a natural untagged scene simple when no effects or presets are selected", () => {
  const text = "今天慢慢说就好。";
  const plan = planSceneDirector({
    text,
    beats: [{ text }],
    assets: [],
  });
  assert.equal(plan.rendered_text, text);
  assert.equal(plan.raw_tags, false);
  assert.equal(plan.cues.length, 0);
  assert.deepEqual(plan.render_request.pauses, []);
});

test("requires beat text to reconstruct the original scene exactly", () => {
  assert.throws(() => planSceneDirector({
    text: "第一句。第二句。",
    beats: [{ text: "第一句。" }, { text: "第二句" }],
  }), /concatenate exactly/);
});

test("rejects anchors outside their beat and anchors without a selected preset", () => {
  assert.throws(() => planSceneDirector({
    text: "第一句。第二句。",
    beats: [
      { text: "第一句。", pause_after_text: "第二句", pause_after_ms: 300 },
      { text: "第二句。" },
    ],
  }), /inside that beat/);

  assert.throws(() => planSceneDirector({
    text: "你好。",
    beats: [{ text: "你好。", anchors: [{ slot: "dialogue", anchor_text: "你好" }] }],
  }), /without a vocal_preset/);
});

test("rejects untrusted inline audio tags when an approved preset enables raw tag preservation", () => {
  assert.throws(() => planSceneDirector({
    text: "[unverified cue]你好。",
    beats: [{
      text: "[unverified cue]你好。",
      vocal_preset: "breathless_dialogue",
      anchors: [{ slot: "dialogue", anchor_text: "你好" }],
    }],
  }), /must not contain existing bracketed audio tags/);
});

test("requires a matching uploaded ambience asset", () => {
  assert.throws(() => planSceneDirector({
    text: "雨声里说话。",
    beats: [{ text: "雨声里说话。" }],
    ambiencePreset: "rain",
    assets: [],
  }), /ambience asset is not available/);
});

test("resolves exact pause anchors to provider alignment timestamps", () => {
  const alignment = {
    characters: ["H", "e", "l", "l", "o", " ", "w", "o", "r", "l", "d"],
    character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
    character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  };
  const pauses = resolveScenePauses({
    alignment,
    expectedText: "Hello world",
    pauses: [
      { after_text: "Hello", duration_ms: 350 },
      { after_text: "world", duration_ms: 500 },
    ],
    voiceDurationSec: 1.1,
  });
  assert.equal(pauses[0].atSec, 0.5);
  assert.equal(pauses[1].atSec, 1.1);
});

test("inserts real silence frames while preserving every speech sample", () => {
  const voicePcm = {
    channels: [new Float32Array([0.1, 0.2, 0.3, 0.4])],
    sampleRate: 10,
    frameCount: 4,
    durationSec: 0.4,
  };
  const inserted = insertTimelinePauses(voicePcm, [
    { after_text: "ab", occurrence: 1, atSec: 0.2, durationSec: 0.2 },
  ]);
  const samples = Array.from(inserted.voicePcm.channels[0]);
  assert.equal(samples.length, 6);
  assert.ok(Math.abs(samples[0] - 0.1) < 1e-6);
  assert.ok(Math.abs(samples[1] - 0.2) < 1e-6);
  assert.equal(samples[2], 0);
  assert.equal(samples[3], 0);
  assert.ok(Math.abs(samples[4] - 0.3) < 1e-6);
  assert.ok(Math.abs(samples[5] - 0.4) < 1e-6);
  assert.equal(inserted.voicePcm.durationSec, 0.6);
  assert.equal(inserted.insertedDurationSec, 0.2);
});

test("moves later text-anchored Foley cues but keeps a cue on the same phrase inside its pause", () => {
  const pauses = [{ atSec: 1.2, durationSec: 0.4 }];
  assert.equal(shiftCueTimeForPauses(1.2, pauses), 1.2);
  assert.equal(shiftCueTimeForPauses(1.8, pauses), 2.2);
  assert.equal(shiftCueTimeForPauses(0.8, pauses), 0.8);
});

test("rejects pauses that resolve to the same PCM frame and caps total inserted duration", () => {
  const voicePcm = {
    channels: [new Float32Array([0.1, 0.2, 0.3, 0.4])],
    sampleRate: 10,
    frameCount: 4,
    durationSec: 0.4,
  };
  assert.throws(() => insertTimelinePauses(voicePcm, [
    { atSec: 0.1, durationSec: 0.1 },
    { atSec: 0.11, durationSec: 0.1 },
  ]), /distinct PCM frame positions/);

  assert.throws(() => insertTimelinePauses(voicePcm, [
    { atSec: 0.2, durationSec: 1 },
  ], { maxDurationSec: 1 }), /exceed the maximum/);
});
