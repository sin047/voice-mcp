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

test("soundscape directive rejects unknown preset names", () => {
  assert.throws(
    () => parseSoundscapeDirective("[soundscape:unknown] close"),
    /Unknown soundscape preset/,
  );
});

test("all curated presets resolve to assets with the intended bus and timeline", () => {
  assert.deepEqual(listSoundscapePresets(), ["rain", "desk", "package", "close", "intimate"]);

  const rain = buildSoundscapePresetCues("rain", assets);
  assert.deepEqual(rain.missingAssets, []);
  assert.equal(rain.cues.length, 1);
  assert.equal(rain.cues[0].fileId, "fx_rain");
  assert.equal(rain.cues[0].kind, "ambience");
  assert.equal(rain.cues[0].loop, true);

  const desk = buildSoundscapePresetCues("desk", assets);
  assert.equal(desk.cues[0].fileId, "fx_keyboard");

  const packagePreset = buildSoundscapePresetCues("package", assets);
  assert.equal(packagePreset.cues.length, 2);
  assert.deepEqual(packagePreset.cues.map((cue) => cue.atSec), [0, 2]);

  const close = buildSoundscapePresetCues("close", assets);
  assert.equal(close.cues.length, 2);
  assert.equal(close.cues[0].fileId, "fx_cloth");
  assert.equal(close.cues[1].fileId, "fx_wet");

  const intimate = buildSoundscapePresetCues("intimate", assets);
  assert.equal(intimate.cues.length, 5);
  assert.deepEqual(intimate.cues.map((cue) => cue.atSec), [0, 3, 6, 10, 14]);
});

test("soundscape preset reports missing assets without returning incomplete cues silently", () => {
  const result = buildSoundscapePresetCues("intimate", assets.slice(0, 3));
  assert.deepEqual(result.missingAssets, ["润滑液涂抹", "连续节奏", "床铺物件声", "收尾音效"]);
  assert.equal(result.cues.length, 1);
});

test("unsupported soundscape preset is rejected", () => {
  assert.throws(() => buildSoundscapePresetCues("unknown", assets), /Unsupported soundscape preset/);
});
