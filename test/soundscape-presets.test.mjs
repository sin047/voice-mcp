import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSoundscapePresetCues,
  listSoundscapePresets,
  parseSoundscapeDirective,
} from "../src/soundscape-presets.mjs";

const assets = [
  { id: "fx_rain", name: "01_雨声_双耳.wav", kind: "ambience" },
  { id: "fx_keyboard", name: "02_键盘打字_双耳.wav", kind: "ambience" },
  { id: "fx_cloth", name: "03_衣物摩擦_双耳.wav", kind: "foley" },
  { id: "fx_package", name: "04_包装撕开_双耳.wav", kind: "foley" },
  { id: "fx_box", name: "05_盒子开封_双耳.wav", kind: "foley" },
  { id: "fx_lube", name: "06_润滑液涂抹_双耳.wav", kind: "foley" },
  { id: "fx_rhythm", name: "07_连续节奏_双耳.wav", kind: "foley" },
  { id: "fx_wet", name: "11_湿润细节_单声道.wav", kind: "foley" },
  { id: "fx_bed", name: "09_床铺物件声_单声道.wav", kind: "foley" },
  { id: "fx_finish", name: "10_收尾音效_双耳.wav", kind: "foley" },
];

test("soundscape directive is parsed and removed from the voice direction", () => {
  assert.deepEqual(
    parseSoundscapeDirective("[soundscape:intimate] close, low, unhurried"),
    { preset: "intimate", voiceDirection: "close, low, unhurried" },
  );
  assert.deepEqual(
    parseSoundscapeDirective("[soundscape:rain]"),
    { preset: "rain", voiceDirection: undefined },
  );
  assert.deepEqual(
    parseSoundscapeDirective("close, low, unhurried"),
    { preset: null, voiceDirection: "close, low, unhurried" },
  );
  assert.deepEqual(
    parseSoundscapeDirective(undefined),
    { preset: null, voiceDirection: undefined },
  );
});

test("single-action soundscape markers each resolve as independent presets", () => {
  for (const name of ["clothing", "lubricant", "rhythm", "bed", "finish"]) {
    assert.deepEqual(parseSoundscapeDirective("[soundscape:" + name + "] close-mic"), {
      preset: name,
      voiceDirection: "close-mic",
    });
  }
});

test("soundscape directive accepts per-call duration overrides", () => {
  assert.deepEqual(parseSoundscapeDirective("[soundscape:clothing:10] close-mic"), {
    preset: "clothing",
    durationSec: 10,
    voiceDirection: "close-mic",
  });
  assert.equal(parseSoundscapeDirective("[soundscape:rhythm:12.5]").durationSec, 12.5);
  assert.throws(() => parseSoundscapeDirective("[soundscape:rhythm:0.05]"), /between 0.1 and 60/);
  assert.throws(() => parseSoundscapeDirective("[soundscape:rhythm:61]"), /between 0.1 and 60/);
});

test("soundscape directive rejects unknown preset names", () => {
  assert.throws(
    () => parseSoundscapeDirective("[soundscape:unknown] close"),
    /Unknown soundscape preset/,
  );
});

test("all curated presets resolve to assets with the intended bus and timeline", () => {
  assert.deepEqual(listSoundscapePresets(), ["rain", "desk", "package", "close", "intimate", "clothing", "lubricant", "rhythm", "bed", "finish"]);

  const rain = buildSoundscapePresetCues("rain", assets);
  assert.deepEqual(rain.missingAssets, []);
  assert.equal(rain.cues.length, 1);
  assert.equal(rain.cues[0].fileId, "fx_rain");
  assert.equal(rain.cues[0].kind, "ambience");
  assert.equal(rain.cues[0].loop, true);
  assert.equal(rain.cues[0].gain, 0.48, "approved rain v2 level stays frozen");

  const desk = buildSoundscapePresetCues("desk", assets);
  assert.equal(desk.cues[0].fileId, "fx_keyboard");

  const packagePreset = buildSoundscapePresetCues("package", assets);
  assert.equal(packagePreset.cues.length, 2);
  assert.deepEqual(packagePreset.cues.map((cue) => cue.atSec), [0, 2]);
  assert.ok(packagePreset.cues[1].gain > packagePreset.cues[0].gain);
  assert.equal(packagePreset.cues[1].normalizationTargetRms, 0.14);
  assert.equal(packagePreset.cues[1].distanceMeters, 1);
  assert.equal(packagePreset.cues[1].durationSec, 2.2);

  const close = buildSoundscapePresetCues("close", assets);
  assert.equal(close.cues.length, 2);
  assert.equal(close.cues[0].fileId, "fx_cloth");
  assert.equal(close.cues[1].fileId, "fx_wet");
  assert.deepEqual(close.cues.map((cue) => cue.sourceOffsetSec), [12, 12]);
  assert.deepEqual(close.cues.map((cue) => cue.gain), [0.7, 0.46]);
  assert.equal(close.cues[0].normalizationTargetRms, 0.14);
  assert.ok(close.cues[0].pan < 0 && close.cues[1].pan > 0);


  const intimate = buildSoundscapePresetCues("intimate", assets);
  assert.equal(intimate.cues.length, 5);
  assert.deepEqual(intimate.cues.map((cue) => cue.atSec), [0, 3, 6, 10, 14]);
  assert.deepEqual(
    intimate.cues.map((cue) => cue.gain),
    [0.13, 0.274, 0.6, 0.6, 0.46],
    "Intimate clothing returns to the prior level while quiet sequential cues use foreground levels",
  );
  assert.deepEqual(
    intimate.cues.map((cue) => cue.normalizationTargetRms ?? null),
    [null, null, 0.14, 0.14, 0.14],
    "quiet rhythm, bed and finish excerpts receive the approved excerpt normalization target",
  );

  for (const name of ["clothing", "lubricant", "rhythm", "bed", "finish"]) {
    const single = buildSoundscapePresetCues(name, assets);
    assert.equal(single.cues.length, 1, name + " must contain exactly one fixed Foley cue");
    assert.equal(single.cues[0].kind, "foley");
    assert.equal(single.cues[0].atSec, 0, name + " starts at the beginning of its action segment");
    assert.deepEqual(single.missingAssets, []);
  }
  assert.equal(buildSoundscapePresetCues("clothing", assets).cues[0].durationSec, 6);
  assert.equal(buildSoundscapePresetCues("clothing", assets).cues[0].sourceOffsetSec, 12);
  assert.equal(buildSoundscapePresetCues("lubricant", assets).cues[0].durationSec, 6);
  assert.equal(buildSoundscapePresetCues("rhythm", assets).cues[0].durationSec, 8);
  assert.equal(buildSoundscapePresetCues("bed", assets).cues[0].durationSec, 8);
  assert.equal(buildSoundscapePresetCues("finish", assets).cues[0].durationSec, 4);
  assert.equal(buildSoundscapePresetCues("clothing", assets, 10).cues[0].durationSec, 10);
  assert.equal(buildSoundscapePresetCues("rhythm", assets, 12.5).cues[0].durationSec, 12.5);
  assert.equal(buildSoundscapePresetCues("lubricant", assets).cues[0].durationSec, 6, "default duration remains unchanged when no override is supplied");
});

test("soundscape preset reports missing assets without returning incomplete cues silently", () => {
  const result = buildSoundscapePresetCues("intimate", assets.slice(0, 3));
  assert.deepEqual(result.missingAssets, ["润滑液涂抹", "连续节奏", "床铺物件声", "收尾音效"]);
  assert.equal(result.cues.length, 1);
});

test("unsupported soundscape preset is rejected", () => {
  assert.throws(() => buildSoundscapePresetCues("unknown", assets), /Unsupported soundscape preset/);
});
