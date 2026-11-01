# Breath Engine v1

The Breath Engine is an optional, conservative post-synthesis layer for `render_continuous_audio_timeline`. It does not change or time-stretch voice samples and does not make additional ElevenLabs requests.

## 1. Upload breath samples

Upload short, clean WAV samples to the private asset library and classify each one:

- `kind=breath` with `breathType=inhale` for inhalations.
- `kind=breath` with `breathType=exhale` for exhalations.

The Private Drama preview supports these fields in its asset type selector. The HTTP API accepts:

- `Content-Type: audio/wav`
- `X-Asset-Kind: breath`
- `X-Asset-Breath-Type: inhale` or `exhale`

The asset library stores the breath direction in metadata and shows it in `list_sound_assets`.

## 2. Enable automatic placement

Call `render_continuous_audio_timeline` with `breath_engine.enabled=true`. Manual `cues` may be omitted when using only the Breath Engine.

```json
{
  "text": "A short spoken passage.",
  "breath_engine": {
    "enabled": true,
    "max_breaths": 4,
    "min_gap_sec": 0.72,
    "silence_threshold_db": -48,
    "gain": 0.14
  },
  "breath_bus_gain": 0.58
}
```

The planner:

1. Measures 10 ms RMS windows in the generated voice.
2. Finds internal low-energy gaps at least `min_gap_sec` long; leading and trailing silence is ignored.
3. Places an exhale near the previous phrase tail and an inhale just before the next phrase when the gap is long enough.
4. Uses at most `max_breaths` overlays and skips placements that overlap existing effect cues.
5. Returns a `breath_engine` report with detected gaps, selected samples, and skipped placements.

Defaults are intentionally restrained: cue gain 0.14, breath bus gain 0.58, and normalization target RMS 0.04. Adjust only after listening to the result.

## 3. Safety properties and current limits

- The voice PCM buffer is read-only from the planner's perspective.
- Breath overlays are placed only inside detected low-energy windows.
- Total timeline duration and voice timing remain unchanged.
- No extra TTS calls are made.
- Manual and automatic cues share the existing 12-cue timeline limit.
- This is an energy-based v1, not semantic breath recognition. Review the returned report and listen before treating a plan as final.

For manual timing, `speak_with_soundscape` or `render_audio_timeline` also accept `kind: "breath"` cues.