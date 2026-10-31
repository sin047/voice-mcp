# Reference audit — 2026-10-31

Scope: compare the current `zeabur` branch with the user-selected reference projects. This is an engineering audit, not a code-import operation.

## Executive decisions

- `sin047/voice-mcp` remains the only active implementation target.
- Keep the multitrack renderer as the current milestone. Do not mix Spatial Voice or Call/SIP dependencies into this release.
- The two `ai-voice-breath-kiss-water` repositories are practical engineering notes / static documentation sites, not reusable source-code libraries. Extract and independently implement the documented techniques; do not copy their prose wholesale or assume an implementation exists.
- `binaural-voice` is a separate, potentially reusable MIT-licensed Python reference. Prototype it behind an optional spatial-rendering module after the current timeline has reliable regression coverage. Its KU100 HRIR dataset has its own CC BY 4.0 attribution obligations.

## Reference findings

### 1. `sanqianzilanyue/ai-voice-breath-kiss-water` (2026-10-01)

Repository tree contains only `README.md`, `index.html`, and `cover.png`; no application source tree or LICENSE file was found.

Useful documented principles:
- Keep TTS responsible for spoken words / vocal performance; use separately recorded assets for non-speech Foley rather than asking TTS to imitate sound effects.
- Maintain a private, curated asset pool and verify assets contain no unintended speech.
- For sustained beds, use a conservative level below voice, smooth fade-in, and a tail after speech; for transient Foley, use a distinct one-shot treatment.
- Use previous/next text where supported, and avoid needlessly splitting continuous speech into many tiny synthesis requests.
- Treat listening tests as authoritative for subjective quality; signal measurements are diagnostic aids, not substitutes for listening.

Migration status:
- The current project already has a private asset store, Foley/ambience buses, per-cue timing, fade controls, voice ducking, and a multitrack timeline path.
- Revisit excerpt selection / useful-window detection and per-asset loudness calibration as a later asset-ingestion improvement. Do not change user-approved mix presets without a new A/B test.

### 2. `sanqianzilanyue/ai-voice-breath-kiss-water-2` (2026-10-06)

Repository tree likewise contains only `README.md`, `index.html`, and `cover.png`; no executable application source or LICENSE file was found. Version 2 is a separate, later field-notes document, not a code release.

Additional findings beyond the first article:
- Long / descriptive audio tags relative to short utterances can correlate with repeated speech. The article proposes trimming overly long tags relative to following text; treat its numeric threshold as a hypothesis to test with our own voice/model, not a universal rule.
- Excessive chunk boundaries can create pitch / prosody resets. Prefer fewer, longer voice synthesis spans, and add boundaries only when the vocal performance or audio source actually changes.
- Keep sustained Foley beds running across adjacent speech chunks until explicitly stopped or replaced; do not implicitly reset them at every voice boundary.
- Distinguish continuous beds from one-shot transient cues; they need different timing and level policies.
- Use ASR / transcript comparison to detect missing or repeated words, but do not automatically reject breathy/non-verbal sections solely because ASR cannot transcribe them.
- Keep a known-good listening baseline and change one dimension per A/B iteration.
- The article describes using timestamp alignment as a route to placing effects without repeatedly cutting the voice. This is directly relevant to the future timeline editor.

Migration status:
- The current `render_audio_timeline` synthesizes each `voice` segment independently. That enables voice-free intervals, but can introduce exactly the chunk-boundary discontinuity described in the article.
- Implemented in beta.30 as `render_continuous_audio_timeline`: one TTS request, character-level alignment, and Foley/ambience overlays placed by exact `after_text` anchors or absolute `at_sec` offsets. The tool uses the inline audio player and exposes its capability through `/status`.
- Add optional transcript QA as a diagnostic / warning, not as a hard gate for expressive or non-verbal audio.

### 3. `Saekisui/binaural-voice`

The repository contains `binaural_voice.py`, `speak.py`, `requirements.txt`, and a precomputed KU100 near-field HRIR dataset. Repository LICENSE is MIT.

Useful architecture:
- Strip position markers before TTS while preserving their character offsets.
- Request character-level timestamps and map marker offsets to audio time.
- Render mono TTS through measured binaural HRIR data, with distance-dependent gain / filtering.
- Move the source only while voiced audio is present; freeze position during silence to avoid inaudible teleportation.
- Use smooth trajectories rather than abrupt left/right jumps.
- The README explicitly limits the result to headphone listening and notes generic-HRTF front/back ambiguity and limited elevation support.

Asset licensing:
- The repository's code is MIT.
- The KU100 HRIR source is separately identified as Zenodo DOI 10.5281/zenodo.4297951, CC BY 4.0. Keep its attribution and license notice with any redistributed dataset or derived package. Do not treat the code license as automatically covering the dataset.

Migration decision:
- Do not add SciPy / NumPy / large HRIR assets to the current Node runtime yet.
- First define a stable spatial cue schema and render interface, then prototype an optional worker/service or a carefully measured Node implementation.
- Spatial rendering remains a later milestone after multitrack timing and playback behavior are stable.

### 4. `Yinglianchun/voice-mcp`

The original reference is MIT-licensed. It provides the initial MCP/TTS/player foundation and documents ElevenLabs integration, audio tags, request handling, and an inline player. The current fork has evolved substantially; preserve compatibility where useful rather than replacing its newer architecture.

## Current branch assessment

The `zeabur` branch currently contains (beta.33):
- ElevenLabs synthesis with language/performance handling and previous/next text context.
- Existing `speak` and `speak_with_soundscape` paths.
- Private audio asset storage and soundscape mixing.
- Independent `voiceSegments` and `totalDurationSec` support in the mixer.
- `render_audio_timeline` with `voice`, `foley`, `ambience`, and `gap` segment types, where voice chunks are synthesized separately.
- `render_continuous_audio_timeline`, which synthesizes the full passage once and resolves Foley/ambience cue offsets using ElevenLabs character timestamps. Beta.33 adds an optional timeline tail so Foley/ambience can continue after speech ends without another TTS request.
- `plan_voice_chunks`, which plans natural sentence/clause chunks with exact source reconstruction and bounded previous/next context, without spending TTS credits.
- `alignment_audit`, a non-blocking check of provider character alignment text/timestamp integrity. It is not ASR and cannot verify the audible waveform.
- `speak_long`, which plans long text, synthesizes chunks sequentially with a rolling request-ID chain, joins 24 kHz mono PCM server-side, and returns one WAV URL / one inline player card (up to 180 seconds). The inter-chunk silence is adjustable; this first version is voice-only.

Important caveats:
- `speak_long` creates one playback file/card, but the speech is still synthesized in multiple TTS requests. Request-ID continuity may reduce prosody changes but cannot guarantee the result sounds identical to one uninterrupted TTS pass. Listen testing is required.
- `speak_long` currently has no Foley overlay. `render_continuous_audio_timeline` remains the single-request mode for timestamp-aligned Foley/ambience on passages within its limit.

## Recommended sequence

1. Deploy beta.33 and listen-test one continuous-voice Foley sequence with a short pure-sound tail. Keep the existing approved voice / Foley levels fixed; assess timing, tail length and fade shape only.
2. Add a reusable cue-timing planner that can propose `after_text` anchors and pure-sound intervals without making TTS requests; use the user-approved Foley asset mapping.
3. Add optional ASR-backed repetition / omission diagnostics as a separate opt-in, with non-blocking handling for breaths and non-verbal audio.
4. Define a spatial cue contract (position, distance, start time, movement duration, interpolation, silence behavior).
5. Prototype KU100 binaural rendering as an isolated optional module, preserving MIT and CC BY 4.0 notices.
6. Keep Call/SIP work in `ringringring-shin`; do not introduce SIP or real-time transport into the speech-bar pipeline.

## Guardrails

- No bulk repository copying.
- No code reuse from repositories without an explicit license.
- Preserve attribution and dataset-specific licensing independently from code licensing.
- Keep the core runtime light; measure CPU, memory, cold start, and deployment size before adding DSP dependencies.
- Preserve accepted voice / Foley presets. Any audible parameter change requires a controlled A/B test and user approval.
