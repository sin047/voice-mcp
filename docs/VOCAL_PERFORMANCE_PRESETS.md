# Shin Voice — Vocal Performance Presets

Status: beta.40 — deterministic preset registry and planner; no synthesis integration

## Purpose

Provide reusable, named combinations of already-reviewed vocal cues. A preset selects the cue roles and their placement rules; the caller still supplies exact phrases from the text. This keeps the result inspectable and avoids guessing where a sound should occur.

The preset tools are planning-only:
- `list_vocal_presets` returns the curated preset catalogue.
- `plan_vocal_preset` places a selected preset around exact text anchors and returns `rendered_text`.
- Both make zero ElevenLabs requests and consume zero TTS credits.
- Review the result, then pass `rendered_text` to the existing continuous timeline renderer when an audio render is actually wanted.

No new dependency or environment variable is required.

## Preset catalogue

| Preset ID | Name | Contents | Validation |
|---|---|---|---|
| `close_soft` | 轻柔贴近 | `soft_inhale` → `close_whisper` | Positive combined audition; cues remain separate phrase beats |
| `heavy_breathing` | 持续粗重喘息 | `heavy_ragged_breathing` | Preferred approved breath cue |
| `breathless_dialogue` | 带喘息的低语台词 | `breathless_husky_whisper` | Approved spoken-delivery cue |
| `ragged_release` | 短促粗重呼气 | `ragged_exhale` | Approved complement, not automatic after every line |
| `breathing_to_dialogue` | 喘息过渡到说话 | `heavy_ragged_breathing` → `breathless_husky_whisper` | Components have positive listening status; this exact combined sequence is not yet auditioned |
| `afterglow` | 余韵放缓 | Optional breathing → optional breath-inflected line → untagged closing line | Arrangement guidance only; full sequence not yet auditioned |

Unverified mouth/contact candidates are intentionally excluded from these default presets. They remain in the cue catalogue for later small-batch listening tests. `warm_exhale` is also excluded because its standalone final placement sounded abrupt in the user's audition.

## Tool contracts

### list_vocal_presets

Read-only catalogue. No arguments. Returns preset IDs, descriptions, slots, tags, cue-level validation status, and usage notes.

### plan_vocal_preset

Input:
- `text`: exact spoken text, 1–1200 characters.
- `preset`: one of the six preset IDs above.
- `anchors`: 1–6 entries, each with:
  - `slot`: a slot ID listed for the selected preset.
  - `anchor_text`: exact single-line phrase copied from `text`.
  - `occurrence`: optional 1-based occurrence for repeated phrases.

Anchors must be supplied in the preset's slot order, must match the spoken text exactly, and must point to distinct non-overlapping phrases. Required slots must be supplied. Afterglow requires its untagged `closing_line` slot and at least one of its optional vocal slots.

The planner returns:
- `rendered_text`: text with the selected TTS tags placed.
- `slots`: resolved slot/anchor information, including the deliberately untagged closing line.
- `cues`: cue-level validation status and recommended use.
- `warnings`: combination-level listening caveats.
- `estimated_tts_calls: 0`.

## Example

Input:

```json
{
  "text": "等我缓一口气。\n再听我说。",
  "preset": "breathing_to_dialogue",
  "anchors": [
    { "slot": "breathing", "anchor_text": "等我缓一口气" },
    { "slot": "dialogue", "anchor_text": "再听我说" }
  ]
}
```

Planned text:

```text
[heavy ragged breathing]
等我缓一口气。
[breathless husky whisper] 再听我说。
```

This example is a planning result, not a claim that the combined sequence has passed listening validation. The warning remains attached to the plan.

## Design constraints

- Presets are reusable arrangements, not new TTS tags.
- A cue is included only when the user explicitly selects a preset and supplies its exact anchor.
- The planner never infers actions or vocal cues from keywords.
- A sustained nonverbal breath (`heavy_ragged_breathing`) is distinct from breath-inflected dialogue (`breathless_husky_whisper`).
- Afterglow keeps its final spoken line untagged. Do not append `warm_exhale` by default.
- Presets do not add physical-action Foley. Use `plan_foley_cues` separately; each explicitly selected action still maps to one primary asset.
- Do not change approved voice settings, Foley gains, pan, source offsets, fades, or asset excerpts while adding this planner.
- Unverified mouth/contact cues require separate controlled auditions before promotion into a preset.
