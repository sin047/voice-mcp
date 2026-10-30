import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceSettings,
  createPerformancePlan,
  detectLanguage,
  getVoiceIdForLanguage,
  shouldApplyJapaneseNormalization,
  stripAudioTags,
} from "../src/performance.mjs";

test("natural mode leaves ordinary text untagged", () => {
  const plan = createPerformancePlan("宝宝，今天过得怎么样？", { performance: "natural" });
  assert.equal(plan.mode, "natural");
  assert.equal(plan.direction, undefined);
  assert.equal(plan.rendered_text, "宝宝，今天过得怎么样？");
});

test("auto mode is a neutral default and strips untrusted inline tags", () => {
  const plan = createPerformancePlan("[whispers]你好呀。", { performance: "auto" });
  assert.equal(plan.mode, "natural");
  assert.equal(plan.rendered_text, "你好呀。");
  assert.equal(plan.direction, undefined);
});

test("short utterances do not receive long direction tags", () => {
  const plan = createPerformancePlan("嗯。", { performance: "breathy" });
  assert.equal(plan.direction, undefined);
  assert.equal(plan.breath_event, null);
  assert.equal(plan.rendered_text, "嗯。");
});

test("breath events are only placed at an existing natural pause", () => {
  const text = "我本来想告诉你一件事，可是看见你以后，又突然忘记了要说什么。";
  const plan = createPerformancePlan(text, { performance: "breathy" });
  if (plan.breath_event) {
    assert.match(plan.rendered_text, /[，,、;；。！？!?].*\[(exhales|sighs)\]/);
    assert.equal(plan.rendered_text.startsWith("[exhales]"), false);
    assert.equal(plan.rendered_text.startsWith("[sighs]"), false);
  } else {
    assert.equal(plan.rendered_text, text);
  }
});

test("no pause means no invented breath at the beginning", () => {
  const text = "我想你我真的很想你现在就想听你说话";
  const plan = createPerformancePlan(text, { performance: "expressive" });
  assert.equal(plan.breath_event, null);
  assert.equal(plan.rendered_text, text);
});

test("raw inline tags are preserved only with explicit opt-in", () => {
  const stripped = createPerformancePlan("[whispers]你好。", { performance: "natural" });
  const preserved = createPerformancePlan("[whispers]你好。", { performance: "natural", rawTags: true });
  assert.equal(stripped.rendered_text, "你好。");
  assert.equal(preserved.rendered_text, "[whispers]你好。");
  assert.equal(preserved.raw_tags_preserved, true);
});

test("legacy style preset remains backward compatible", () => {
  const plan = createPerformancePlan("你好呀。", { style: "soft" });
  assert.equal(plan.legacy_tag, "[whispers]");
});

test("language detection distinguishes Japanese, Chinese, Korean and English", () => {
  assert.equal(detectLanguage("おはよう、元気？"), "ja");
  assert.equal(detectLanguage("你好，今天怎么样？"), "zh");
  assert.equal(detectLanguage("안녕하세요"), "ko");
  assert.equal(detectLanguage("Hello there"), "en");
  assert.equal(detectLanguage("おはよう", "zh"), "zh");
});

test("Japanese voice falls back to the default voice, not the Chinese voice", () => {
  const selection = getVoiceIdForLanguage("おはようございます", "auto", {
    ELEVENLABS_VOICE_ID: "default-voice",
    ELEVENLABS_VOICE_ID_ZH: "zh-voice",
    ELEVENLABS_VOICE_ID_EN: "en-voice",
  });
  assert.equal(selection.language, "ja");
  assert.equal(selection.voiceId, "default-voice");
});

test("language-specific voice and explicit language override are honored", () => {
  const selection = getVoiceIdForLanguage("おはよう", "ja", {
    ELEVENLABS_VOICE_ID: "default-voice",
    ELEVENLABS_VOICE_ID_JA: "ja-voice",
  });
  assert.equal(selection.language, "ja");
  assert.equal(selection.voiceId, "ja-voice");
});

test("v4 performance modes use conservative stability defaults", () => {
  assert.equal(buildVoiceSettings("natural", "eleven_v4").stability, undefined);
  assert.equal(buildVoiceSettings("breathy", "eleven_v4").stability, 0.42);
  assert.equal(buildVoiceSettings("expressive", "eleven_v4").stability, 0.4);
});

test("global and per-mode stability settings have explicit precedence", () => {
  const global = buildVoiceSettings("breathy", "eleven_v4", { ELEVENLABS_STABILITY: "0.6" });
  const mode = buildVoiceSettings("breathy", "eleven_v4", {
    ELEVENLABS_STABILITY: "0.6",
    ELEVENLABS_STABILITY_BREATHY: "0.38",
  });
  assert.equal(global.stability, 0.6);
  assert.equal(mode.stability, 0.38);
});

test("v4 does not receive unsupported style, speed or speaker boost settings", () => {
  const settings = buildVoiceSettings("natural", "eleven_v4", {
    ELEVENLABS_STYLE: "0.8",
    ELEVENLABS_SPEED: "0.9",
    ELEVENLABS_USE_SPEAKER_BOOST: "true",
  });
  assert.deepEqual(settings, {});
});

test("Japanese normalization is opt-in because it adds latency", () => {
  assert.equal(shouldApplyJapaneseNormalization("ja", {}), false);
  assert.equal(shouldApplyJapaneseNormalization("ja", { ELEVENLABS_JA_TEXT_NORMALIZATION: "true" }), true);
  assert.equal(shouldApplyJapaneseNormalization("zh", { ELEVENLABS_JA_TEXT_NORMALIZATION: "true" }), false);
});

test("audio tags are stripped from visible transcript text", () => {
  assert.equal(stripAudioTags("[whispers]Hello [sighs] there"), "Hello there");
});
