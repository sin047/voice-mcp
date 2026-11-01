# Shin Voice — Vocal Cue Playbook

Status: practical guide for the beta.38 `plan_vocal_cues` planner and beta.39 five-category catalogue. This document records reference-derived prompt wording and current listening decisions; it is not a provider compatibility guarantee.

## 1. Is “Afterglow” in the supplied reference?

No. The screenshots do **not** contain the word `Afterglow` as a tag or named technique.

The reference does include several related ingredients:
- `heavy ragged breathing`
- `breathless husky whisper`
- `soft shuddering inhale`
- `ragged exhale` / `breathless ragged exhale`
- `warm exhale`
- close-up / ear-level whisper descriptions
- pauses and breath between action or dialogue groups

We use **Afterglow** as our own shorthand for the *arrangement* at the end of a performance: intensity eases, speech relaxes, and the ending is allowed to settle. It is not a literal TTS tag. Do not send `[Afterglow]` to TTS.

Important distinction: `warm exhale` is a real phrase in the reference, but it is not synonymous with Afterglow. In our audition, placing `[warm exhale]` as a separate event after the final line sounded abrupt, so it is not part of the preferred cue set.

## 2. Keep three sound systems separate

| System | What it controls | Example |
|---|---|---|
| Vocal Cue Planner | TTS delivery instructions or nonverbal vocal performance | `[breathless husky whisper]` |
| Breath Engine | Analysis and careful placement of breath audio already present in generated voice | opening inhale analysis / repositioning |
| Foley Engine | Separate physical-action sound assets mixed onto the timeline | clothing rustle or another explicitly selected Foley asset |

A TTS tag is not a sound-file asset. A Foley cue is not a voice-performance tag. Do not add a Foley layer just because a TTS tag is present.

## 3. Current preferred cue set

These are the only cues with positive listening feedback on the current Shin Voice. Some were tested together, so the results validate the combination/use case rather than an isolated scientific A/B test.

| Cue | Role | Current decision | Use it when |
|---|---|---|---|
| `soft shuddering inhale` | nonverbal inhale | positive in a combined audition | a small, inward, slightly trembling inhale is needed |
| `intense close-up whisper against ear` | close voice delivery | positive in a combined audition | the spoken line should feel close and whispered |
| `heavy ragged breathing` | sustained nonverbal breathing | approved; preferred breathing cue | breathing itself is the foreground between/around lines |
| `ragged exhale` | short rough exhalation | approved complement | a distinct release of breath is needed |
| `breathless husky whisper` | breath-inflected spoken delivery | approved; described as more realistic | the words themselves should sound breathless and husky |
| `warm exhale` | standalone warm breath event | not preferred; sounded abrupt after a line | do not use by default; retest only if a different placement is genuinely needed |

### The key distinction

- **`heavy ragged breathing`** is a nonverbal breathing event. It is not a substitute for breath-inflected speech.
- **`breathless husky whisper`** changes the delivery of the words being spoken. It is not a standalone breathing clip.
- **`ragged exhale`** is a separate, shorter exhalation. Do not append it automatically to every line.

## 4. Recommended arrangement patterns

### A. Breathing, then breath-inflected speech

Use when the breath is foregrounded first and the voice then begins speaking while still unsettled.

```text
等我一下……
[heavy ragged breathing]
[breathless husky whisper] 我还没完全缓过来。
```

The breathing cue and spoken-delivery cue have different jobs. Keep them as separate phrase groups rather than stacking both tags on the same words.

### B. Close whisper with a soft inhale

```text
[soft shuddering inhale]
[intense close-up whisper against ear]
别急，慢慢来。
```

This combination received positive feedback in the first consolidated audition. It does not prove every other whisper or inhale variant will work equally well.

### C. Afterglow-like easing

This is an arrangement pattern, **not** a new tag:

```text
[heavy ragged breathing]
[breathless husky whisper] 让我再缓一会儿。
嗯……现在好多了。
```

Use the final untagged line to let the performance relax. Preserve a natural pause. Do not add `[warm exhale]` at the end by default: that exact standalone placement was disliked in the audition.

The current result is a gradual transition, not a validated automatic “afterglow” effect. A future true tail/decay treatment would need separate audio-level design and listening validation.

## 5. Planner usage

The planner is deterministic and makes **zero TTS calls**. It does not infer actions or cues from keywords.

- Use `line` layout for a separate nonverbal breath or a new performance group.
- Use `inline` layout when a delivery tag belongs directly to a spoken phrase.
- Supply the exact spoken-text anchor.
- If an anchor phrase repeats, specify its 1-based occurrence.
- Put cues in spoken order.
- Keep to one principal cue per phrase; avoid stacking unrelated tags.
- Preserve the user's punctuation and pauses. Do not add long ellipses everywhere to force a breath.
- Daily conversation receives no intimate-performance tags by default.

Example planner request (illustrative JavaScript object):

```js
{
  text: "等我一下……我还没完全缓过来。",
  cues: [
    {
      cue: "heavy_ragged_breathing",
      anchor_text: "等我一下",
      placement: "after",
      layout: "line"
    },
    {
      cue: "breathless_husky_whisper",
      anchor_text: "我还没完全缓过来",
      placement: "before",
      layout: "inline"
    }
  ]
}
```

Review the returned `rendered_text` before sending it to the existing speech tool. Planning does not synthesize audio.

## 6. Reference-derived but not yet approved

The screenshots also contain mouth/contact and other voice descriptions (for example, kiss, lick, suction, swallowing, sticky parting, low husky whisper, and gentle growl prompts). They remain **candidate prompts**, not validated presets. Test only when there is a clear use case, in a small batch, and keep one main sound/action per beat.

Do not:
- assume every descriptive phrase is an officially supported ElevenLabs Audio Tag;
- assume the same phrase transfers identically across voices, languages, or models;
- insert phonetic spellings or invented syllables just because they appear in a reference example;
- layer several unrelated mouth/breath/physical sounds into one moment;
- change voice ID, model, B2.1 breath level, or approved mix settings to compensate for an ineffective tag;
- rerun TTS automatically when a tag is ignored or overacted.

## 7. Validation record

- First combined audition: `soft shuddering inhale` + `intense close-up whisper against ear` — user feedback: “挺像的”.
- Breathing pair audition: `heavy ragged breathing` + `ragged exhale` — both accepted; the former is preferred.
- Breath-inflected speech audition: `breathless husky whisper` — user liked it and found it more realistic; explicitly distinguished from nonverbal `heavy ragged breathing`.
- Standalone ending test: `warm exhale` after the final line — user found it abrupt and preferred the previous version.

All decisions are specific to the current voice and the tested text placements. Keep the voice, model, B2.1 settings, and approved Foley mix parameters unchanged unless a separate controlled test is requested.


## 8. Live five-category catalogue

Use the read-only MCP tool `list_vocal_cues` to inspect the current registry before planning. It returns five categories:

| Category | What belongs here | Tool |
|---|---|---|
| 呼吸 | Inhale, sustained breathing, exhale | `plan_vocal_cues` |
| 说话状态 | Close whisper, husky or breathless spoken delivery | `plan_vocal_cues` |
| 口腔与接触声音 | Kiss, lick, suction, swallowing and related reference prompts | `plan_vocal_cues` |
| 动作音效 | Uploaded physical-action audio assets | `plan_foley_cues` |
| 余韵过渡 | Arrangement patterns such as Afterglow | No standalone cue; compose explicitly |

The catalogue includes a per-cue listening status and recommended use. It is read-only and makes zero TTS calls. Foley entries show action/asset names but do not expose or change the approved mix parameters.

Afterglow remains an arrangement pattern. Its optional sequence is: keep a breathing cue only if the scene calls for it, transition to breath-inflected dialogue if appropriate, let the final line return to untagged relaxed speech, then preserve a natural pause. It must never be emitted as `[Afterglow]`.
