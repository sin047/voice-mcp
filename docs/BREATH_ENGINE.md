# Breath Engine — Phase 1A: Enhanced Repair

This phase adds an opt-in post-synthesis repair path to the existing continuous timeline.

## Compatibility

- breath_mode=off remains the default and preserves the existing output path.
- breath_mode=natural remains unchanged: it only repositions qualifying opening inhales.
- breath_mode=enhanced is opt-in and only processes high-confidence breath islands already present in the generated voice PCM.

## Enhanced processing

1. Reuse the existing analyzer and its conservative confidence threshold.
2. Reduce an accepted breath only when it is less than 12 dB below its adjacent speech, with a maximum 12 dB cut.
3. Measure the first 10–90% amplitude rise over 5 ms windows. For inhales with attacks shorter than 90 ms, apply a 60–150 ms raised-cosine fade-in.
4. Use type-specific transitions: a 35 ms release fade for inhales, or a 30 ms onset fade for exhales.
5. Reposition only qualifying opening inhales. Internal breaths are not moved.
6. Verify that the total duration and all speech-island samples remain unchanged.

The mode is pure code after the single TTS synthesis. It does not call ElevenLabs again, create new breath audio, insert or loop breath clips, or modify speech samples.

## Why the breath pool is a separate milestone

The reference notes in breath-kiss-water-4 describe harvesting and manually screening independent breath clips, then placing them in long gaps according to inhale/exhale type and adjacent speech level. The current voice-mcp asset library contains Foley and ambience assets, but no separately classified breath pool. We should not silently reinterpret Foley assets as vocal breaths or regenerate already-approved breath samples.

Phase 1B will add explicit breath-asset metadata and a composer only after the previously approved clips can be located or supplied and classified. Until then, enhanced mode repairs existing breaths only.

## Validation

Unit tests use deterministic synthetic speech and noise-breath fixtures. They verify attenuation, attack smoothing, opening-inhale positioning, duration preservation, confidence gating, and speech-sample preservation. These tests do not replace a listening test on the configured Chinese voice.


## Phase 1B — Breath Asset Pool (beta.50)

The reference comparison is intentionally split into two independent ideas:

- Breath-kiss-water-3 focuses on post-synthesis placement: identify a high-confidence opening inhale and move it toward the next phrase by swapping only surrounding silence. It does not create new breath samples.
- Breath-kiss-water-4 adds a screened breath pool: select short nonverbal clips, classify inhale/exhale, keep them separate from speech, and place them at the edges of long silent gaps. In its described workflow, clips are screened by listening, normalized consistently, and placed relative to the neighboring phrase rather than the whole recording.

This repository implements an independent, smaller first pass rather than copying reference code:

1. `kind="breath"` is a separate asset category, never a Foley cue.
2. Each clip has `breathType` (`inhale` or `exhale`) and a review status.
3. Clips extracted from the recording archive are always `pending`; approval is an explicit user action.
4. The original recording is never modified. Extraction stores the source recording ID and exact source range.
5. The composer considers only approved 0.22–1.1 second clips.
6. It inserts into empty inter-phrase gaps of at least 0.75 seconds, skips gaps containing any existing non-speech island, skips soft/breathy delivery, and skips passages already containing three accepted breaths.
7. Short gaps receive at most one clip. Gaps long enough to fit both receive an exhale near the previous phrase and an inhale near the next phrase.
8. Loudness is measured against the adjacent phrase (last 0.5 seconds for exhale; first 0.5 seconds for inhale), targeting 8 dB below that phrase with a conservative gain cap.
9. Exhale clips receive a 30 ms onset fade; inhale clips receive a 35 ms release fade.
10. The clips are mixed on a separate bus. No speech sample is modified, no clip is looped or stretched, and total duration is unchanged.

The composer is opt-in via `breath_pool_mode="conservative"`; it does not change the existing `off`, `natural`, or `enhanced` breath-repair modes. No TTS request is made for planning, extraction, preview, approval, or mixing.
