# Shin · Private Drama Lab (v1.4.0-beta.1)

This is an **experimental**, independent preview of multitrack voice / sound-effect mixing.
It lives on the `voice-v1.4-private-drama` branch. **Do not replace the stable
`zeabur` deployment until you have tested the mix and access protections.**

## Confirmed listening direction

The selected target is **immersive foreground voice + headphone spatial depth + independent sound effects**.

1. **Voice stays in front.** Keep the established ElevenLabs Japanese voice as the emotional and intelligibility anchor. Do not force breath tags or dramatic intensity into ordinary lines.
2. **Spatial depth supports the voice.** Headphone-first listening, with subtle left/right placement and distance cues where appropriate. Basic stereo panning is available in this beta; true HRTF binaural positioning is a later phase and must be labelled as such until implemented and tested.
3. **Effects are real, separate tracks.** Ambience and Foley/action cues remain independently adjustable. Effects should enrich a scene without masking speech.

### Planned mix architecture

- **Voice bus:** centered by default, foreground level, no automatic widening.
- **Ambience bus:** optional low-level bed, loop and long fades allowed.
- **Foley bus:** discrete event cues with manual start time, gain, pan/position and short fades.
- **Master bus:** conservative peak protection; future voice-aware ducking should lower effects gently while speech is active, not pump or crush the mix.
- Preserve source stereo when appropriate. Use simple pan for basic placement; use HRTF only for compatible mono sources and after headphone A/B validation.

### Delivery phases

- **Beta / current:** local voice + local effects, manual cue timing, ambience/Foley types, gain, pan, fades, ambience looping, stereo preview and local WAV export.
- **Next audio pass:** separate bus controls, safer master headroom, optional voice-aware effects ducking, and an explicit spatial mode selector. Add HRTF positioning only after mono/stereo handling is validated.
- **Later integration:** evaluate how a finished mixed audio result can be returned through the ChatGPT MCP tool/player. The separate browser preview is not the embedded ChatGPT player.

## What exists today

- `/drama-preview`: a mobile-friendly browser prototype for a Japanese voice
  track and up to 12 independent local effects.
- `/drama/timeline.mjs`: a declarative cue-sheet planner with validated start
  times, effect kind (ambience / foley), gain, pan, fades and ambient looping.
- Separate ambience and Foley mix buses with independent bus gain controls.
- Voice-priority ducking: a short-window RMS envelope from the voice track gently lowers the effects buses while speech energy is present, then releases gradually during pauses.
- Optional browser HRTF positioning for mono effects; stereo source files retain their original stereo image and use basic stereo panning.
- Local preview with conservative master compression and offline WAV peak protection.
- In-browser offline WAV rendering, peak protection and export.
- Opt-in Japanese voice generation via `POST /speak`, using the existing
  ElevenLabs voice ID and restrained/close direction.
- Regression coverage and HTTP smoke tests.

The normal `speak` MCP tool is **unchanged** in this branch.

## Using the preview after deploying a separate TEST instance

1. Open `https://<your-test-host>/drama-preview` in Chrome, Edge or Safari.
2. Choose an existing spoken-audio file, **or** enter a Japanese script and
   explicitly click `生成日语人声` (this calls ElevenLabs and uses credits).
3. Choose local FX audio files, enter start times, adjust per-cue volume
   (initially 0.1 for ambience / 0.22 for Foley), pan and optional ambient looping.
4. Set ambience/Foley bus levels, master level, voice-priority ducking and
   spatial mode. HRTF mode is intended for headphones and mono FX sources.
5. Preview over headphones and export a stereo WAV.
6. Make small adjustments to one track at a time and compare A/B.

The `audio/*` file picker accepts common MP3, WAV and M4A inputs *when your
browser's decodeAudioData supports the codec*. This is a browser limitation,
not a guaranteed format-conversion service.

## Privacy and rights

Local audio file contents are decoded and mixed only in the browser. They are
**not** sent to the server or committed to GitHub. The only exception is when
you explicitly click `生成日语人声`: the text is sent by HTTPS POST to the
configured server and its ElevenLabs provider.

**Avoid submitting private recordings or licensed sound effects to this public
repository.** Keep the actual FX files locally, and keep track of each
recording's source, license and allowed uses. You can share URLs or
short test clips for evaluation without committing an asset.

**Important production blocker:** the existing server's speech endpoints are
not authenticated. Deploy the preview only behind a private access control,
and add authentication, rate limits and appropriate quotas before public
usage, or an unauthorized caller could consume ElevenLabs credits.

## What this beta does NOT do

- No autonomous emotionally expressive multi-turn performance yet.
- No real Foley sample library included; no asset downloads.
- No KU100 recording or true binaural microphone simulation; browser HRTF
  positioning is a playback spatializer, not a binaural microphone recording.
- HRTF positioning currently applies only to mono effects. Stereo files are
  deliberately preserved and use basic stereo pan.
- Voice ducking is based on a precomputed RMS loudness envelope, not semantic
  dialogue understanding or a live hardware-style compressor sidechain.
- No time-aligned dialogue-to-Foley cue inference; timestamps are manually set.
- No automatic equalization, mastering or intelligibility scoring.
- No completed single-click export inside the official ChatGPT MCP player.
  Current rendering/export happens on the separate browser preview page.

## Next acceptance test

Use one Japanese voice clip and 1–3 locally selected, properly licensed FX clips.
The user has supplied a small WAV trial pack for local technical testing; do not
commit those files or redistribute them. Check:

(a) speech stays clearly in front, (b) ambience remains subtle,
(c) short Foley cues do not mask consonants or line endings,
(d) voice-priority ducking is gentle and does not audibly pump,
(e) HRTF placement on mono effects is audible but not distracting,
(f) stereo source material is preserved sensibly,
(g) mobile Safari playback/export works, and
(h) no source file is uploaded by the preview workflow.

Only after this passes should HRTF and voice-aware ducking be implemented and
compared against the simpler stereo mix.
