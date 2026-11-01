import test from "node:test";
import assert from "node:assert/strict";
import { planFoleyCues, sequenceFoleyCues } from "../src/foley-cue-planner.mjs";

const assets = [
  { id: "fx_clothing", name: "03_衣物摩擦_双耳.wav", kind: "foley", durationSec: 33.901 },
  { id: "fx_package", name: "04_包装撕开_双耳.wav", kind: "foley", durationSec: 10.251 },
  { id: "fx_box", name: "05_盒子开封_双耳.wav", kind: "foley", durationSec: 10.478 },
  { id: "fx_liquid", name: "06_润滑液涂抹_双耳.wav", kind: "foley", durationSec: 24.706 },
  { id: "fx_rhythm", name: "07_连续节奏_双耳.wav", kind: "foley", durationSec: 51.421 },
  { id: "fx_bed", name: "09_床铺物件声_单声道.wav", kind: "foley", durationSec: 101.1 },
  { id: "fx_wet", name: "11_湿润细节_单声道.wav", kind: "foley", durationSec: 31.974 },
  { id: "fx_finish", name: "10_收尾音效_双耳.wav", kind: "foley", durationSec: 16.881 },
];

test("plans one approved Foley asset for each exact action anchor without TTS", () => {
  const plan = planFoleyCues({
    text: "我把包装撕开。接着打开盒子。最后轻轻放下。",
    actions: [
      { action: "package_open", after_text: "我把包装撕开" },
      { action: "box_open", after_text: "接着打开盒子" },
      { action: "ending_detail", after_text: "最后轻轻放下" },
    ],
    assets,
    pureAudioTailSec: 2.5,
  });

  assert.equal(plan.plan_only, true);
  assert.equal(plan.estimated_tts_calls, 0);
  assert.equal(plan.sequence_foley, true);
  assert.equal(plan.tail_duration_sec, 2.5);
  assert.equal(plan.action_count, 3);
  assert.deepEqual(plan.cues.map((cue) => cue.asset_id), ["fx_package", "fx_box", "fx_finish"]);
  assert.ok(plan.cues.every((cue) => cue.kind === "foley" && cue.loop === false));
  assert.equal(plan.cues[0].duration_sec, 1.8);
});

test("preserves approved clothing source offset and gain preset", () => {
  const plan = planFoleyCues({
    text: "我整理了一下衣袖。",
    actions: [{ action: "clothing_rustle", after_text: "我整理了一下衣袖" }],
    assets,
  });
  assert.equal(plan.cues[0].asset_id, "fx_clothing");
  assert.equal(plan.cues[0].source_offset_sec, 12);
  assert.equal(plan.cues[0].normalization_target_rms, 0.14);
  assert.equal(plan.cues[0].duration_sec, 6);
});

test("uses exact occurrence and requires anchors in spoken-text order", () => {
  const plan = planFoleyCues({
    text: "我停一下，再停一下，然后继续。",
    actions: [{ action: "package_open", after_text: "停一下", occurrence: 2 }],
    assets,
  });
  assert.equal(plan.anchor_order[0].start, 6);

  assert.throws(() => planFoleyCues({
    text: "先打开盒子，再撕开包装。",
    actions: [
      { action: "package_open", after_text: "撕开包装" },
      { action: "box_open", after_text: "打开盒子" },
    ],
    assets,
  }), /spoken-text order/);
});

test("rejects missing anchors and missing private assets", () => {
  assert.throws(() => planFoleyCues({
    text: "我把盒子打开。",
    actions: [{ action: "package_open", after_text: "撕开包装" }],
    assets,
  }), /not found exactly/);

  assert.throws(() => planFoleyCues({
    text: "我把盒子打开。",
    actions: [{ action: "box_open", after_text: "我把盒子打开" }],
    assets: assets.filter((asset) => asset.id !== "fx_box"),
  }), /asset is not available/);
});

test("caps cue duration to source length and reports the adjustment", () => {
  const plan = planFoleyCues({
    text: "衣物轻轻摩擦。",
    actions: [{ action: "clothing_rustle", after_text: "衣物轻轻摩擦", duration_sec: 60 }],
    assets: [{ ...assets[0], durationSec: 14 }],
  });
  assert.equal(plan.cues[0].duration_sec, 2);
  assert.equal(plan.warnings.length, 1);
  assert.match(plan.warnings[0], /capped/);
});

test("requires a final text anchor for a pure-audio tail", () => {
  assert.throws(() => planFoleyCues({
    text: "动作结束。我们再说几句话。",
    actions: [{ action: "ending_detail", after_text: "动作结束" }],
    assets,
    pureAudioTailSec: 2,
  }), /last Foley anchor must be at the end/);
});

test("trims one Foley action before the next cue and preserves ambience", () => {
  const cues = [
    { fileId: "fx_clothing", kind: "foley", atSec: 1, durationSec: 6, fadeInSec: 0.15, fadeOutSec: 0.7 },
    { fileId: "fx_rain", kind: "ambience", atSec: 0, durationSec: 12, fadeInSec: 1, fadeOutSec: 1 },
    { fileId: "fx_box", kind: "foley", atSec: 4, durationSec: 2, fadeInSec: 0.06, fadeOutSec: 0.4 },
  ];
  const metadata = new Map([
    ["fx_clothing", { durationSec: 33.9 }],
    ["fx_box", { durationSec: 10.4 }],
  ]);
  const result = sequenceFoleyCues(cues, metadata, 15);
  assert.equal(result.cues[0].durationSec, 3);
  assert.equal(result.cues[1].durationSec, 12);
  assert.equal(result.cues[2].durationSec, 2);
  assert.equal(result.adjustments.length, 1);
  assert.equal(result.adjustments[0].asset_id, "fx_clothing");
});

test("rejects Foley actions whose resolved starts are too close", () => {
  const cues = [
    { fileId: "fx_clothing", kind: "foley", atSec: 2, durationSec: 4 },
    { fileId: "fx_box", kind: "foley", atSec: 2.05, durationSec: 2 },
  ];
  const metadata = new Map([
    ["fx_clothing", { durationSec: 33.9 }],
    ["fx_box", { durationSec: 10.4 }],
  ]);
  assert.throws(() => sequenceFoleyCues(cues, metadata, 15), /too close together/);
});

test("rejects Foley cues whose source offset leaves no usable audio", () => {
  const cues = [{ fileId: "fx_short", kind: "foley", atSec: 0, sourceOffsetSec: 2, durationSec: 1 }];
  const metadata = new Map([["fx_short", { durationSec: 2.05 }]]);
  assert.throws(() => sequenceFoleyCues(cues, metadata, 5), /too short/);
});
