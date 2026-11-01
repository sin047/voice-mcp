# Vocal Performance Engine

Status: deterministic cue planner and five-category catalogue in beta.39; reusable vocal-performance preset registry/planner added in beta.40; beta.41 explicitly connects approved preset output to continuous timeline synthesis through opt-in raw-tag preservation; beta.42 allows voice-only continuous rendering with no Foley cues.

## Purpose

See the practical usage guide: [Vocal Cue Playbook](./VOCAL_CUE_PLAYBOOK.md). Reusable bundles are documented in [Vocal Performance Presets](./VOCAL_PERFORMANCE_PRESETS.md). When rendering planner output, set `raw_tags: true` on `render_continuous_audio_timeline`.

Turn the user's reference guide into deterministic, inspectable TTS performance instructions. The first phase only plans tags around exact text anchors. It does not call ElevenLabs, alter generated audio, infer actions from keywords, or change the approved voice and mix settings.

## Three separate systems

- Breath Engine: analyzes existing PCM breath-like segments and, in opt-in natural mode, repositions only high-confidence opening inhales.
- Vocal Cue Planner: places TTS performance tags and optional user-supplied vocalization text around exact spoken-text anchors.
- Foley Engine: places physical-action audio assets on the continuous timeline. One explicitly selected action maps to one primary Foley asset.

A TTS tag such as [wet squelch] is not a playable Foley asset. A Foley asset does not replace a voice-performance tag.

## Initial reference-derived cue catalogue

| Cue ID | Chinese label | TTS tag | Family |
|---|---|---|---|
| soft_inhale | 轻颤吸气 | soft shuddering inhale | breath |
| heavy_ragged_breathing | 急促粗重喘息 | heavy ragged breathing | breath |
| ragged_exhale | 粗重呼气 | ragged exhale | breath |
| warm_exhale | 温热呼气 | warm exhale | breath |
| close_whisper | 贴近耳边低语 | intense close-up whisper against ear | voice |
| husky_low_whisper | 沙哑低声耳语 | husky low whisper | voice |
| breathless_husky_whisper | 气息不稳的沙哑低语 | breathless husky whisper | voice |
| gentle_growl | 轻柔喉音 | gentle possessive growl | voice |
| deep_wet_kiss | 深吻 | deep, messy wet kiss | mouth |
| wet_licking | 湿润舔舐 | deep, messy wet licking | mouth |
| wet_sucking | 湿润吮吸 | wet sucking | mouth |
| wet_squelch | 湿润挤压声 | wet squelch | mouth |
| sticky_parting | 湿黏分离声 | sticky wet parting | mouth |
| swallowing_hard | 用力吞咽 | swallowing hard | mouth |
| lower_lip_suck | 下唇轻吮 | soft suck on the lower lip | mouth |
| neck_bite | 颈部轻咬 | firm bite on the neck | mouth |

These are candidate prompts based on the supplied reference, not a claim that every tag is officially supported or will sound natural on this voice. Validate them in small batches and retain only audible improvements.

## Five-category cue catalogue

The read-only MCP tool is `list_vocal_cues`. It returns five separate categories:

1. `breath` — inhale, breathing and exhale performance cues.
2. `voice_state` — delivery applied to spoken dialogue, such as close whisper or breathless husky whisper.
3. `mouth_contact` — reference-derived mouth/contact TTS prompts; these remain unverified until auditioned.
4. `physical_action` — separate uploaded Foley assets, planned with `plan_foley_cues`.
5. `ending_transition` — arrangement guidance such as Afterglow; not a TTS tag and not an automatic audio effect.

Each TTS cue carries a voice-specific `validation_status` and a short `recommended_use`. The catalogue reports the already auditioned distinctions without upgrading untested prompts. Foley entries expose action and asset names only; approved gain, pan, source-offset and fade parameters stay in the Foley planner.

Listing the catalogue is read-only and has `estimated_tts_calls: 0`. No new environment variable is required.

## Planner contract

MCP tools: list_vocal_cues (read-only catalogue) and plan_vocal_cues

Input:
- text: exact text to speak (1–1200 characters)
- cues: 1–16 explicit cue requests
- each cue includes a catalogue cue, exact anchor_text, optional 1-based occurrence, placement (before or after), layout (line or inline), and optional user-authored vocalization

Rules:
- Every cue must be explicitly selected. No keyword inference.
- Anchors must match the speech text exactly.
- Repeated phrases require an explicit occurrence.
- Cues must be supplied in spoken-text order.
- Line layout inserts a tag on its own line at a phrase boundary.
- Inline layout keeps the tag and optional vocalization adjacent to the anchor.
- More than two tags on one phrase returns a warning about tag stacking.
- The planner does not add invented Japanese/Chinese phonetic syllables. Vocalization text must be supplied explicitly.
- The returned rendered_text is passed to the existing continuous voice timeline only after the plan is reviewed.

Output includes the cue list, Chinese labels, exact tags, resolved anchors, rendered text, warnings, and estimated_tts_calls: 0.

## Formatting guidance

- Prefer one or two cues per phrase. Avoid stacking unrelated tags.
- Use line layout for a new voice-state/action group; use inline layout for a short vocalization attached to a tag.
- Preserve user-authored punctuation and blank lines.
- Use ellipses and short pauses only when they are present in the spoken text or explicitly requested; do not silently rewrite the dialogue.
- Avoid strong bilabial popping syllables when they produce an unwanted hard plosive. Do not assume Japanese phonetic spellings transfer naturally to Chinese TTS.
- Daily conversation should not receive intimate-performance cues by default.

## First listening result (beta.38)

The first consolidated audition on the current Shin Voice used two tags together:
- `[soft shuddering inhale]` before the approach phrase.
- `[intense close-up whisper against ear]` before the close-whisper phrase.

User feedback: “挺像的” (“sounds quite realistic”).

Status: the two-tag combination passed an initial subjective listening check on the current voice. This is not yet an isolated A/B validation of each tag, and it does not validate the rest of the catalogue. Keep the existing voice, B2.1 breath settings, and mix parameters unchanged. No Foley assets or gain settings were modified.

## Second listening result — breathing pair

The current voice was auditioned once with the following two explicit tags in the same short passage:
- `[heavy ragged breathing]` after “让我缓口气”.
- `[ragged exhale]` after “再靠近一点”.

User feedback: both sounded good and should be retained; `heavy ragged breathing` is the preferred of the two.

Status:
- `heavy_ragged_breathing`: accepted for the preferred cue set; first choice.
- `ragged_exhale`: accepted for the preferred cue set; approved alternate/complement.
- Validation scope is this combined audition on the current voice; no isolated A/B claim is made.
- Keep the current voice, model, B2.1 breath settings, and mix parameters unchanged.
- No Foley assets or gain settings were modified.

## Third listening result — breathless husky whisper

The current voice was auditioned with one inline `[breathless husky whisper]` cue before “想再靠近你一点” in:
“等我一下……我还没缓过来，想再靠近你一点。”

User feedback: liked it and found it more realistic. The user clarified that this is a spoken-delivery state, distinct from `heavy ragged breathing`.

Approved use distinction:
- `breathless_husky_whisper`: apply to spoken dialogue when the voice itself should sound breath-inflected and husky.
- `heavy_ragged_breathing`: a separate nonverbal breathing performance; preferred for sustained, vigorous breathing around or between spoken lines.
- `ragged_exhale`: a distinct rough exhalation, useful as a short release or transition.

The distinction is semantic and based on the current voice audition; it does not imply that these prompts are guaranteed provider controls. Keep the existing voice, model, B2.1 breath settings, and mix parameters unchanged.

## Afterglow note

`Afterglow` is a local arrangement concept, not a literal tag from the supplied reference image and not a registered catalogue cue. The reference does contain `warm exhale`, but a standalone post-speech `[warm exhale]` was auditioned and the user found it abrupt. Do not use it by default.

For now, build an Afterglow-like ending through a gradual performance transition:
1. If the scene calls for it, use the already approved nonverbal `heavy ragged breathing` cue.
2. Move into the already approved spoken `breathless husky whisper` state.
3. Let the final line return toward untagged, relaxed speech with natural punctuation and a short pause.
4. Do not append a separate exhale tag just to manufacture a tail. The final breath/decay remains an unvalidated design goal.

This is a usage convention only. It does not change TTS settings, add audio processing, or claim that an Afterglow effect is already implemented.

## Validation plan

1. Test the planner with synthetic text only; no TTS.
2. After deployment, select one short cue pair from the catalogue and make one consolidated audition.
3. Record whether each tag is clearly realized, ignored, overacted, or read aloud.
4. Do not increase gain to compensate for an ineffective tag.
5. Keep only validated tags in the preferred cue set.
6. Later, optionally allow the continuous timeline to accept an approved vocal cue plan directly. Do not integrate until the tags have been auditioned and the text/anchor behavior is stable.

## Non-goals

- No voice ID, model, stability, speed, style, or B2.1 breath-level changes.
- No automatic TTS retries.
- No automatic inference from sexual/action keywords.
- No changes to Foley gain, pan, fades, source offsets, or one-action/one-asset policy.
- No new environment variables or runtime dependencies.


## beta.43 · Scene Director

The Scene Director composes multiple explicitly selected vocal presets across exact ordered text beats, optional pauses, optional rain/desk ambience and explicit Foley actions. It is deterministic and planning-only; the render path remains a single continuous TTS synthesis. See docs/SCENE_DIRECTOR.md.
