# Scene Director · beta.46

## Purpose

The Scene Director is the composition layer above the existing vocal preset planner, Foley planner and continuous audio renderer. It turns an explicitly marked scene into one render request without making a TTS call during planning.

It supports:
- ordered text beats, each optionally assigned a vocal preset;
- exact phrase anchors for every vocal preset;
- optional, precisely aligned pauses inserted as actual silent PCM frames;
- one optional uploaded ambience bed (rain or desk);
- explicit Foley actions mapped one-to-one to matching uploaded assets;
- an optional audio tail after the voice.

The renderer still synthesizes the entire spoken passage once. Scene beats do not create separate TTS requests.

## Important guarantees

1. Beat text must concatenate byte-for-byte to the supplied scene text. The director never rewrites the user's spoken words.
2. Untagged beats remain natural. Vocal tags are inserted only by the selected approved preset and exact anchors.
3. If any preset inserts tags, source text containing pre-existing bracketed audio tags is rejected. This prevents raw-tag preservation from forwarding unreviewed instructions.
4. Physical actions are never inferred from keywords. Each Foley action must be explicitly selected and anchored to an exact phrase.
5. Foley actions use the existing approved asset mapping, gain, pan, source offset and fade settings.
6. A pause is inserted after an exact phrase using provider character alignment. Speech samples are copied unchanged; only zero-valued PCM frames are added.
7. A Foley cue anchored to the same phrase starts at the beginning of that pause. Foley cues anchored to later phrases move forward by earlier inserted pauses.
8. Ambience is optional. The supported beds are the uploaded rain and desk assets.
9. Planning makes zero ElevenLabs calls. The returned render request uses one continuous synthesis.

## Beat model

Each beat contains:
- id: optional unique label;
- text: exact contiguous substring of the full scene text;
- vocal_preset: optional approved preset;
- anchors: exact slot-to-phrase mappings required by that preset;
- pause_after_text and pause_after_ms: optional exact phrase and pause length;
- pause_after_occurrence: optional 1-based global occurrence when the phrase repeats.

The ordered beat text must reconstruct the original text exactly. Keep beat boundaries where the performance changes, but do not split one continuous phrase merely to create more beats.

Pause duration is 80–3000 ms per beat, with a 10-second total inserted-pause limit and a maximum 12 pause anchors. Pauses are real silence, not a TTS tag. The final WAV remains subject to the existing 60-second soundscape limit.

## Example: breathing → breathless dialogue → natural closing

Original spoken text:

等我一下……
我还没完全缓过来。
现在好多了。

Scene plan:

    {
      "text": "等我一下……\n我还没完全缓过来。\n现在好多了。",
      "beats": [
        {
          "id": "breathing",
          "text": "等我一下……\n",
          "vocal_preset": "heavy_breathing",
          "anchors": [
            { "slot": "breathing", "anchor_text": "等我一下" }
          ],
          "pause_after_text": "等我一下",
          "pause_after_ms": 350
        },
        {
          "id": "dialogue",
          "text": "我还没完全缓过来。\n",
          "vocal_preset": "breathless_dialogue",
          "anchors": [
            { "slot": "dialogue", "anchor_text": "我还没完全缓过来" }
          ]
        },
        {
          "id": "closing",
          "text": "现在好多了。"
        }
      ]
    }

This yields one tagged continuous text passage, one 350 ms aligned pause, and one final untagged line. The closing beat returns to natural speech; Afterglow is not emitted as a literal TTS tag.

## Example: ambience plus an explicit Foley action

Add the following fields to the same scene request when wanted:

    {
      "ambience_preset": "rain",
      "foley_actions": [
        {
          "action": "clothing_rustle",
          "after_text": "现在好多了。"
        }
      ],
      "tail_duration_sec": 2
    }

The rain bed uses the uploaded rain asset. The clothing action uses the approved clothing-rustle asset and mix settings. A tail is useful when the final Foley cue should continue after speech; when a Foley tail is requested, the last Foley anchor must be at the end of the spoken text.

## Explicit Foley rhythm choices

The planner does not infer an action from scene text. Select one of these rhythm variants explicitly when appropriate:

- `penetration_basic` — uploaded `抽插_基础节奏.wav`;
- `penetration_crisp` — uploaded `抽插_清脆弹响.wav`;
- `penetration_intense` — uploaded `抽插_高强度密集.wav`.

Each maps to one asset and one non-looping cue. The initial gain, normalization target, duration and fades are intentionally identical so the first listening comparison isolates the source recording. These new settings remain provisional until individually auditioned. The legacy `continuous_rhythm` action remains mapped to the original `07_连续节奏` asset.

The selected `cumshot` action maps to the existing `收尾音效` asset. The older `ending_detail` action remains available as a compatibility alias. The liquid-application action continues to use the existing `润滑液涂抹` asset.

## Render workflow

1. Call plan_scene_director with the original text, ordered beats, optional pauses, optional ambience and explicitly selected Foley actions.
2. Review rendered_text, warnings, cue IDs and the render_request.
3. Pass the render_request fields to render_continuous_audio_timeline. If the plan contains vocal tags, preserve them with raw_tags: true.
4. The render tool performs exactly one TTS synthesis, resolves phrase anchors against character alignment, inserts the planned silence, shifts later text-anchored Foley cues, mixes the selected assets and returns one WAV.
5. Listening feedback is still required before calling a new cue or composition approved.

The render request sets save_recording: false by default. Saving is a separate explicit choice.

## Current limits

- 1–1200 scene text characters;
- 1–12 ordered beats;
- up to 6 vocal anchors per beat;
- up to 12 pauses, 80–3000 ms each, 10 seconds total;
- up to 8 Foley actions;
- one ambience bed: rain or desk;
- one continuous TTS call;
- maximum 60 seconds final soundscape.

The planner does not invent missing Foley assets, select intimate/contact cues automatically, or silently add pauses.