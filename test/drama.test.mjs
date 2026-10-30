import test from "node:test";
import assert from "node:assert/strict";
import { createDramaTimeline, DRAMA_TIMELINE_LIMITS } from "../src/drama-timeline.mjs";
import { dramaPreviewHtml } from "../src/drama-preview.mjs";

test("creates a restrained private drama cue sheet with local-only references", () => {
  const timeline = createDramaTimeline({
    voiceDurationSec: 28,
    cues: [
      { fileId: "rain_01", kind: "ambience", atSec: 0, loop: true },
      { fileId: "fabric_01", kind: "foley", atSec: 10.5, pan: -0.5 },
    ],
  });
  assert.equal(timeline.version, 2);
  assert.equal(timeline.mode, "private_drama");
  assert.equal(timeline.voice.gain, 0.9);
  assert.equal(timeline.mix.ambienceBusGain, 0.82);
  assert.equal(timeline.mix.foleyBusGain, 0.9);
  assert.equal(timeline.mix.masterGain, 0.85);
  assert.equal(timeline.mix.duckingEnabled, true);
  assert.equal(timeline.mix.spatialMode, "stereo");
  assert.deepEqual(timeline.cues.map((cue) => cue.gain), [0.1, 0.22]);
  assert.equal(timeline.cues[0].loop, true);
  assert.equal(timeline.cues[1].pan, -0.5);
  assert.equal(timeline.cues[1].loop, false);
  assert.ok(Object.isFrozen(timeline));
  assert.ok(Object.isFrozen(timeline.cues));
  assert.ok(Object.isFrozen(timeline.mix));
  assert.ok(Object.isFrozen(timeline.mix.ducking));
});

test("rejects unrecognized effect types and unsafe nonlocal references", () => {
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 10, cues: [
    { fileId: "x", kind: "remote", atSec: 0 },
  ]}), /unsupported kind/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 10, cues: [
    { fileId: "https://host/secret.mp3", kind: "foley", atSec: 0 },
  ]}), /safe local fileId/);
});

test("validates gain, pan, start time and total cue count", () => {
  const make = (cue) => createDramaTimeline({ voiceDurationSec: 5, cues: [{ fileId: "fx", kind: "foley", ...cue }] });
  assert.throws(() => make({ gain: 1.2 }), /gain/);
  assert.throws(() => make({ pan: -1.2 }), /pan/);
  assert.throws(() => make({ atSec: 6 }), /atSec/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, cues: Array.from({ length: 13 }, () => ({ fileId: "f", kind: "foley" })) }), /at most/);
  assert.equal(DRAMA_TIMELINE_LIMITS.maxSeconds, 180);
  assert.deepEqual(DRAMA_TIMELINE_LIMITS.spatialModes, ["stereo", "hrtf"]);
});

test("rejects non-finite duration and invalid fades", () => {
  assert.throws(() => createDramaTimeline({ voiceDurationSec: Number.POSITIVE_INFINITY }), /finite number/);
  assert.throws(() => createDramaTimeline({
    voiceDurationSec: 5,
    cues: [{ fileId: "fx", kind: "foley", atSec: 0, durationSec: 0.5, fadeInSec: 0.4, fadeOutSec: 0.3 }],
  }), /fades exceed/);
});

test("validates mix buses, ducking and spatial modes", () => {
  const timeline = createDramaTimeline({
    voiceDurationSec: 12,
    ambienceBusGain: 0.4,
    foleyBusGain: 0.7,
    masterGain: 0.8,
    duckingEnabled: false,
    duckingAmount: 0.3,
    spatialMode: "hrtf",
  });
  assert.equal(timeline.mix.ambienceBusGain, 0.4);
  assert.equal(timeline.mix.foleyBusGain, 0.7);
  assert.equal(timeline.mix.masterGain, 0.8);
  assert.equal(timeline.mix.duckingEnabled, false);
  assert.equal(timeline.mix.duckingAmount, 0.3);
  assert.equal(timeline.mix.spatialMode, "hrtf");
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, ambienceBusGain: 1.1 }), /ambienceBusGain/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, foleyBusGain: -0.1 }), /foleyBusGain/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, masterGain: 2 }), /masterGain/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, duckingAmount: 1.2 }), /duckingAmount/);
  assert.throws(() => createDramaTimeline({ voiceDurationSec: 5, spatialMode: "surround" }), /spatialMode/);
});
test("local preview has a player, multitrack cue editing, optional TTS and WAV export", () => {
  const html = dramaPreviewHtml();
  for (const marker of ['id="voice"', 'id="fx"', 'id="preview"', 'id="export"', 'id="generateVoice"', 'id="ambienceBusGain"', 'id="foleyBusGain"', 'id="spatialMode"', 'id="duckingEnabled"', "scheduleVoiceDucking", 'panner.panningModel = "HRTF"', "OfflineAudioContext", "encodeWav", "createDramaTimeline", 'type="module"']) {
    assert.ok(html.includes(marker), "Missing preview feature: " + marker);
  }
  assert.ok(html.includes("本机"));
  assert.ok(html.includes("ElevenLabs"));
});

test("embedded preview JS has valid browser module syntax", () => {
  const html = dramaPreviewHtml();
  const script = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(script);
  const source = script[1].replace(/import \{ createDramaTimeline \} from "\/drama\/timeline\.mjs";/, "");
  assert.doesNotThrow(() => new Function(source));
});
