# Breath Engine and Explicit Foley Design

Status: Phase 1 implemented; opt-in natural repair is integrated, default off
Target branch: `zeabur`
Baseline: `48867e86935c11bb51391c2b2236df58710fa6c0` (1.4.0-beta.35)

## Goals

- Make breathing feel attached to the voice rather than pasted into silent gaps.
- Increase breath presence without repeatedly regenerating already-good speech.
- Keep voice, breath, and physical Foley conceptually separate.
- Keep Foley cues explicit, one action to one primary sound asset, and non-overlapping by default.
- Preserve beta.34/beta.35-approved voice and Foley gain values.
- Keep planning and audio analysis deterministic and free of ElevenLabs calls.

## Reference audit

### ai-voice-breath-kiss-water-3

Audited README.md and index.html. The repository contains documentation/examples rather than a reusable Node package. Useful techniques:

- Detect speech/breath islands using short-frame RMS and voicing/pitch information.
- Identify pre-speech breaths and move only surrounding silence so the breath ends close to the next word.
- Preserve total duration and do not move speech samples.
- Edit dry voice first, then restore the original Foley bed so action timing does not drift.
- Measure and gently correct over-loud speech blocks after pauses.

### ai-voice-breath-kiss-water-4

Audited README.md and index.html. It adds:

- Merge adjacent breath tags/interjections, including across chunk boundaries.
- Detect duplicated lead interjections separately from ordinary speech repetition.
- Harvest short, unvoiced breath candidates into a reusable pool; reject candidates that contain spoken words.
- Place exhales near the previous phrase and inhales near the next phrase.
- Match each breath to the adjacent phrase level instead of normalizing all breaths to one global level.
- Inspect opening breath distance, attack time and level relative to speech.
- Add optional ASR-based repetition/omission checks.

Neither reference repository contains a LICENSE file or a package manifest in its root tree. Do not copy their source verbatim. Independently implement the relevant algorithms and retain attribution in project documentation.

## Existing voice-mcp constraints

- Node.js 22; the production Dockerfile installs only package.json dependencies.
- Current dependencies are MCP SDK, Express and Zod. No Python, NumPy, or FFmpeg runtime is installed in the production image.
- render_continuous_audio_timeline already requests one 24 kHz mono PCM TTS result with character alignment, then mixes Foley/ambience.
- src/wav-audio.mjs already decodes PCM to Float32Array and performs the final stereo mix.
- The current mixer recognizes only ambience and Foley buses.
- The existing Foley planner maps each selected action to exactly one approved asset and supports sequential trimming.
- Character alignment is not ASR. Keep transcript QA as a separate optional subsystem.
- Do not alter current approved soundscape gain constants as part of Breath Engine work.

## Current implementation status

- `src/breath-engine.mjs` implements pure-code breath candidate analysis using 10 ms RMS frames and a lightweight periodicity estimate.
- It classifies candidate inhale/exhale contours, compares their level with nearby voiced speech, and reports confidence/rejection reasons.
- `repositionOpeningBreaths` moves only high-confidence pre-speech inhales by swapping surrounding silence. It preserves total duration and all samples at/after the next speech onset.
- `render_continuous_audio_timeline` exposes `breath_mode: "off" | "natural"`; `off` remains the default. The response includes `breath_processing` diagnostics.
- The first implementation is covered by synthetic PCM tests. It is not yet validated against a real ElevenLabs sample and must remain opt-in.
- Breath-pool storage, insertion, and ASR QA are not implemented yet.

## Proposed architecture

### 1. Breath analysis (pure code)

Create src/breath-engine.mjs with no network calls and no TTS dependency.

Input: decoded mono PCM, sample rate, optional thresholds.

Output: candidate vocal islands with:
- start/end sample and seconds
- duration
- RMS / dBFS
- voiced-frame ratio or periodicity score
- level relative to adjacent speech
- likely type: inhale, exhale, vocalization, uncertain
- confidence and exclusion reason

Use short frames (initially 10 ms) and conservative detection. RMS alone is insufficient: unvoiced consonants and whispers can resemble breaths. Use a lightweight periodicity/voicing estimate and require nearby voiced speech for automatic breath classification. Keep thresholds configurable and return diagnostics.

### 2. Repair existing breaths first

Initial mode: reposition only clearly detected pre-speech breaths.

- Only consider a breath followed by speech within a bounded interval.
- Move silence around the breath; do not alter speech samples.
- Target a short lead-in before the next spoken word (initial reference value: about 80 ms).
- Preserve total sample count and all speech sample offsets.
- Do not move sentence-internal breaths that are already naturally attached.
- Do not process whisper-only passages or uncertain candidates.
- Apply small edge fades only where needed to prevent clicks.

This stage requires no breath pool and no additional TTS calls.

### 3. Breath pool (later, opt-in)

Populate the pool passively from already-generated, user-approved recordings wherever possible. Do not generate a separate breath-only batch by default.

Candidate selection should:
- prefer short, unvoiced segments with no lexical content
- reject spoken interjections unless deliberately catalogued as vocalizations
- distinguish inhale/exhale by envelope shape, but retain an uncertain class
- preserve source voice identity and avoid repeated use of the same clip in adjacent gaps
- store provenance and quality metadata

If persistent storage is needed, extend the asset kind model with `breath` rather than misclassifying breaths as Foley. Keep breath samples separate from physical-action assets.

### 4. Placement policy

For a later enhanced mode:

- Inhale: place immediately before the next phrase.
- Exhale: place immediately after the previous phrase.
- Do not place a breath in the middle of a gap merely because the gap exists.
- Start conservatively: at most one inserted breath per eligible gap and at most two inserted breaths per speech segment.
- Skip gaps that are too short, segments that already contain enough breath, and whisper passages.
- Match gain to the adjacent phrase, not to a global breath target.
- Use distinct short fades for inhale and exhale; treat published example values as starting hypotheses, not approved final settings.
- Never overlap two breath clips or let a breath cover intelligible speech.

### 5. Breath processing modes

Expose an explicit optional mode on the continuous timeline:

- off: current behavior, byte-for-byte path unchanged.
- natural: analyze and repair existing breaths only; no inserted clips.
- enhanced: natural mode plus approved breath-pool insertions.

Keep the default as off until the user has listened to a consolidated comparison. Do not silently change the stable voice path.

### 6. Audio QA

ASR is a separate optional stage:

- Check repeated lead interjections, repeated phrases and omissions.
- Keep character alignment for timing only; never call it transcript verification.
- Do not automatically re-run TTS when QA fails.
- Prefer a local/optional ASR service rather than adding a heavyweight ASR runtime to the Zeabur Node container.
- Record QA findings and let the caller decide whether a new synthesis is worth the cost.

## Explicit Foley naming

The current planner uses generic IDs for several actions. The next Foley metadata revision should expose explicit Chinese action labels and stable internal IDs.

Proposed names, subject to auditioning the actual stored clips:

| Internal ID | Display label | Asset status |
|---|---|---|
| `penetration_rhythm` | 抽插 | Candidate mapping to the current “连续节奏” asset; must be auditioned first |
| `lubricant_application` | 涂抹 | Existing “润滑液涂抹” asset; verify clip before final mapping |
| `cumshot` | 射精 | No confirmed matching asset yet; do not map “收尾音效” by filename alone |
| `clothing_rustle` | 衣物摩擦 | Existing asset |
| `package_open` | 包装撕开 | Existing asset |
| `box_open` | 盒子开封 | Existing asset |

Rules:

- Use explicit action labels in assistant-facing plans; internal IDs are stable machine keys, not euphemisms.
- One action maps to one primary sound asset.
- Do not add bed creaks, sheet rustle, wet details or other secondary layers automatically.
- Keep Foley sequential and non-overlapping by default.
- Do not rename or remap existing generic actions until the corresponding private audio has been auditioned.
- Preserve legacy IDs as aliases during migration so existing callers do not break.
- An action must be explicitly selected from the intended scene/action plan; do not infer it from a single ambiguous keyword.

## Implementation order

1. Add pure analysis helpers and synthetic-PCM unit tests. No MCP tool changes and no TTS calls.
2. Add conservative existing-breath repositioning and invariants proving unchanged speech samples, unchanged total duration and no cue drift.
3. Add an opt-in `natural` mode to the continuous timeline; default remains off.
4. Add breath-pool storage and enhanced placement only after candidate quality can be verified.
5. Add optional ASR QA separately, with no automatic TTS retries.
6. Audit existing Foley assets by listening, then introduce explicit labels/aliases without changing approved gain/fade/pan values.
7. Run full tests and CI before any deployment. Conduct one consolidated listening test before changing defaults.

## Non-goals for the first implementation

- No changes to voice ID, voice settings, ElevenLabs model or approved mix levels.
- No automatic TTS regeneration.
- No Python/NumPy/Qwen3-ASR installation in the Zeabur container.
- No Spatial Voice or Call integration.
- No automatic Foley layering.
