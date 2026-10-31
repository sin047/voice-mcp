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
