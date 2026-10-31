# Shin Voice · Voice Delivery Standards v1

Last updated: 2026-10-31

## Approved breathing baseline: B2.1

User listening feedback:
- B2 breathing is clearly audible.
- The inhale sounds natural when placed at a phrase boundary.
- An explicit `[exhales]` tag sounds abrupt and detached from speech.
- Removing the explicit exhale lets the phrase ending fall away naturally.

Therefore the default `breathy` delivery uses:
1. A single audible `[inhales]` event at an existing natural pause in medium/long speech.
2. No explicit `[exhales]` or `[sighs]` event.
3. Natural phrase endings; do not append a separate breath sound.
4. Close-mic, warm, restrained delivery; avoid sudden pitch spikes.
5. Variation: an inhale may be omitted on a nearby subsequent call so the pattern does not become mechanical.

### Breath intensity guide

| Level | Definition | Status |
| --- | --- | --- |
| B1 | Subtle natural breathing, occasional quiet breath | Available as a softer direction |
| **B2.1** | **Clearly audible inhale; phrase ending remains natural; no marked exhale** | **User-approved default for breathy tests** |
| B3 | Stronger / more urgent breathing | Experimental; do not use as default |

### Practical call pattern

- Use `performance: "breathy"`.
- Keep the spoken text natural and conversational.
- Let the server insert the inhale at a punctuation-based natural pause.
- Do not add `[exhales]` manually.
- If an explicitly controlled test is needed, use one `[inhales]` marker and preserve tags only for that test.

Suggested concise direction:
`B2 natural breathing, close-mic, warm voice`

### Important distinction

Breathing tags are vocal-performance instructions for TTS, not separate Foley tracks. Do not duplicate the same inhale/exhale as an added sound effect unless the user explicitly asks for a layered breath track. Keep voice foregrounded and use soundscape Foley only for environmental or physical textures.

## Related implementation

- `src/performance.mjs`: breath tag selection and placement.
- `test/performance.test.mjs`: regression coverage for inhale-only B2.1 behavior.
- `docs/SOUNDSCAPE_MIX_LEVELS.md`: environmental and Foley loudness standards.

## Emotion-aware breathing profiles (beta.24)

The optional MCP `emotion` field lets the caller steer both emotional delivery and breathing intensity. If omitted, existing `performance` behavior is unchanged.

| Emotion | Breath profile | Behavior |
| --- | --- | --- |
| `neutral`, `calm`, `curious`, `tired` | B1 | Subtle natural breathing direction; no forced inhale tag |
| `warm`, `tender` | B2.1 | At most one inhale at an existing natural pause; no explicit exhale or sigh |
| `excited`, `nervous`, `intense` | B3 (experimental) | More noticeable inhale-only direction and tag; never auto-inserts gasps, sighs or exhales |

Safety against mechanical delivery:
- No breath tag is inserted into speech shorter than 18 speakable characters.
- No breath tag is inserted if there is no punctuation-based natural pause.
- B2.1 and B3 can choose no inhale on a nearby call to avoid repetition.
- B3 is opt-in through an explicit emotion value; it is never the default.
- Keep the existing warm, close-mic youth-voice direction. Emotion adds a concise direction prefix rather than replacing the configured voice.

For a gradual emotional transition across a longer passage, split at a natural sentence boundary, change `emotion` one step at a time (for example `neutral → warm → tender`), and pass the immediately preceding `request_id` through `previous_request_ids` when the voice and model are unchanged. Each chunk remains independently generated, but request continuity helps preserve vocal consistency.

The user-approved `breathy` default remains B2.1. The emotion field is an explicit steering control, not an automatic inference from the text; the calling assistant should choose it from the conversational context. For older MCP clients whose cached tool schema does not yet expose the `emotion` field, prefix the remaining `direction` text with `[emotion:warm]` (or another supported emotion); when using a soundscape, place it after the `[soundscape:...]` marker.
