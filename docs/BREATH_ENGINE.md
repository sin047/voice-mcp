# Breath Engine — Phase 1A: Enhanced Repair

This phase adds an opt-in post-synthesis repair path to the existing continuous timeline.

## Compatibility

- breath_mode=off remains the default and preserves the existing output path.
- breath_mode=natural remains unchanged: it only repositions qualifying opening inhales.
- breath_mode=enhanced is opt-in and only processes high-confidence breath islands already present in the generated voice PCM.

## Enhanced processing

1. Reuse the existing analyzer and its conservative confidence threshold.
2. Reduce an accepted breath only when it is less than 12 dB below its adjacent speech, with a maximum 12 dB cut.
3. Measure the first 10–90% amplitude rise over 5 ms windows. If the attack is shorter than 90 ms, apply a 60–150 ms raised-cosine fade-in.
4. Apply a 30 ms release fade to avoid an abrupt cut.
5. Reposition only qualifying opening inhales. Internal breaths are not moved.
6. Verify that the total duration and all speech-island samples remain unchanged.

The mode is pure code after the single TTS synthesis. It does not call ElevenLabs again, create new breath audio, insert or loop breath clips, or modify speech samples.

## Why the breath pool is a separate milestone

The reference notes in breath-kiss-water-4 describe harvesting and manually screening independent breath clips, then placing them in long gaps according to inhale/exhale type and adjacent speech level. The current voice-mcp asset library contains Foley and ambience assets, but no separately classified breath pool. We should not silently reinterpret Foley assets as vocal breaths or regenerate already-approved breath samples.

Phase 1B will add explicit breath-asset metadata and a composer only after the previously approved clips can be located or supplied and classified. Until then, enhanced mode repairs existing breaths only.

## Validation

Unit tests use deterministic synthetic speech and noise-breath fixtures. They verify attenuation, attack smoothing, opening-inhale positioning, duration preservation, confidence gating, and speech-sample preservation. These tests do not replace a listening test on the configured Chinese voice.
