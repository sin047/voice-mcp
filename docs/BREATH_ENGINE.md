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


## Phase 1C — Hybrid Breath Engine (beta.51)

The selected architecture is **A: hybrid**.

### Signal priority

1. TTS is the primary performer. Approved Audio Tags and scene vocal presets control continuous nonverbal breathing, breath-inflected dialogue, and transitions.
2. The post-synthesis analyzer identifies high-confidence breath islands already present in the TTS output.
3. Enhanced repair may attenuate or soften existing breath islands without changing speech samples.
4. The Breath Pool is a fallback layer only. It may fill a genuinely empty inter-phrase gap; it must not duplicate a detected non-speech island.
5. All breath clips are mixed on an independent bus. Foley and ambience remain separate.

### Unified mode

`breath_mode="hybrid"` combines the existing enhanced repair with conservative pool supplementation. It is now the Scene Director render default. Direct renderer callers can still select `off`, `natural`, or `enhanced`; `breath_pool_mode="off"` explicitly disables the pool while retaining hybrid repair.

No extra TTS synthesis is made by hybrid post-processing. TTS-generated breathing is preserved as the primary performance.

### Variation

The pool previously selected the oldest eligible asset every time. Beta.51 introduces a per-render seeded ordering: a stable seed gives repeatable plans, while a fresh server-side seed rotates eligible assets across renders. The planner reports inhale/exhale inventory counts and marks the library as variation-ready only when it contains at least two approved clips of each type. It can still use a smaller approved pool, but the response makes the limitation visible.

### Placement and safeguards

- Existing accepted TTS breaths are counted before supplementation.
- Any non-speech island already occupying a candidate gap blocks pool insertion.
- Clips stay near the phrase edges, not in the middle of the pause.
- No asset is reused twice within one render.
- The existing two-insertions-per-passage cap, 0.75-second minimum gap, soft/breathy skip, and three-existing-breath skip remain in place.
- Pending and rejected clips remain ineligible.
- Speech samples and total duration remain unchanged.

### Next milestone

Build a curated seed library from fresh TTS-only nonverbal breath performances, with each clip manually auditioned before approval. Do not mass-generate a large pool before one combined seed audition validates the exact Audio Tag wording and extraction quality. The previous two expired samples are not assumed to exist on the current server.
