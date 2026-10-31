import test from "node:test";
import assert from "node:assert/strict";
import {
  buildVoiceSettings,
  createPerformancePlan,
  detectLanguage,
  getVoiceIdForLanguage,
  normalizeEmotion,
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

test("breathy mode uses a natural inhale or no tag, never a marked exhale", () => {
  const text = "我本来想告诉你一件事，可是看见你以后，又突然忘记了要说什么。";
  const inhale = createPerformancePlan(text, {
    performance: "breathy",
    recentPatterns: ["none"],
  });
  assert.equal(inhale.breath_event, "inhale");
  assert.match(inhale.rendered_text, /[，,、;；。！？!?].*\[inhales\]/);
  assert.equal(inhale.rendered_text.startsWith("[inhales]"), false);
  assert.doesNotMatch(inhale.rendered_text, /\[(exhales|sighs)\]/);

  const quiet = createPerformancePlan(text, {
    performance: "breathy",
    recentPatterns: ["inhale"],
  });
  assert.equal(quiet.breath_event, "none");
  assert.equal(quiet.rendered_text, text);
});

test("emotion profiles map neutral delivery to subtle B1 without a forced inhale", () => {
  const text = "今日はゆっくり話そう。急がなくても大丈夫だから、落ち着いて聞いていてね。";
  const plan = createPerformancePlan(text, { performance: "natural", emotion: "neutral" });
  assert.equal(plan.emotion, "neutral");
  assert.equal(plan.breath_level, "B1");
  assert.equal(plan.breath_event, null);
  assert.equal(plan.rendered_text, text);
  assert.match(plan.direction, /subtle natural breathing/);
});

test("warm and tender emotions use the approved inhale-only B2.1 profile", () => {
  const text = "今日はゆっくり話そう。急がなくても大丈夫だから、落ち着いて聞いていてね。";
  const inhale = createPerformancePlan(text, {
    performance: "natural",
    emotion: "warm",
    recentPatterns: ["none"],
  });
  assert.equal(inhale.breath_level, "B2.1");
  assert.equal(inhale.breath_event, "inhale");
  assert.match(inhale.rendered_text, /\\[inhales\\]/);
  assert.doesNotMatch(inhale.rendered_text, /\\[(exhales|sighs)\\]/);

  const quiet = createPerformancePlan(text, {
    performance: "natural",
    emotion: "tender",
    recentPatterns: ["inhale"],
  });
  assert.equal(quiet.breath_level, "B2.1");
  assert.equal(quiet.breath_event, "none");
  assert.equal(quiet.rendered_text, text);
});

test("experimental B3 emotions use a stronger inhale cue without explicit exhales", () => {
  const text = "少し緊張しているけれど、ちゃんと伝えたいことがあるんだ。ゆっくり聞いてね。";
  const plan = createPerformancePlan(text, {
    performance: "natural",
    emotion: "excited",
    recentPatterns: ["none"],
  });
  assert.equal(plan.breath_level, "B3");
  assert.equal(plan.breath_event, "strong-inhale");
  assert.match(plan.direction, /more noticeable natural breathing/);
  assert.match(plan.rendered_text, /\\[inhales\\]/);
  assert.doesNotMatch(plan.rendered_text, /\\[(exhales|sighs|gasps)\\]/);
});

test("emotion direction is combined with an explicit voice direction", () => {
  const plan = createPerformancePlan(
    "今日はゆっくり話そう。急がなくても大丈夫だから、落ち着いて聞いていてね。",
    {
      performance: "natural",
      emotion: "warm",
      direction: "close-mic, youthful voice",
    },
  );
  assert.match(plan.direction, /^warm, gentle, emotionally present delivery/);
  assert.match(plan.direction, /close-mic, youthful voice/);
});

test("emotion validation rejects unknown profiles and short phrases stay unforced", () => {
  assert.equal(normalizeEmotion(undefined), undefined);
  assert.equal(normalizeEmotion(" WARM "), "warm");
  assert.throws(() => normalizeEmotion("angry"), /Unsupported emotion/);
  const short = createPerformancePlan("嗯。", { performance: "natural", emotion: "excited" });
  assert.equal(short.breath_level, "B3");
  assert.equal(short.breath_event, null);
  assert.equal(short.rendered_text, "嗯。");
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
