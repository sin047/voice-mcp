# Vocal Performance Engine

Status: Phase 1 planner implemented in beta.38; no synthesis integration yet

## Purpose

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

## Planner contract

MCP tool: plan_vocal_cues

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
