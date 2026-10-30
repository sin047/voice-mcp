# Shin · Private Drama Lab (v1.4.0-beta.1)

This is an **experimental**, independent preview of multitrack voice / sound-effect mixing.
It lives on the `voice-v1.4-private-drama` branch. **Do not replace the stable
`zeabur` deployment until you have tested the mix and access protections.**

## What exists today

- `/drama-preview`: a mobile-friendly browser prototype for a Japanese voice
  track and up to 12 independent local effects.
- `/drama/timeline.mjs`: a declarative cue-sheet planner with validated start
  times, effect kind (ambience / foley), gain, pan, fades and ambient looping.
- Local preview with stereo panning and restrained dynamics compression.
- In-browser offline WAV rendering, peak protection and export.
- Opt-in Japanese voice generation via `POST /speak`, using the existing
  ElevenLabs voice ID and restrained/close direction.
- Regression coverage and HTTP smoke tests.

The normal `speak` MCP tool is **unchanged** in this branch.

## Using the preview after deploying a separate TEST instance

1. Open `https://<your-test-host>/drama-preview` in Chrome, Edge or Safari.
2. Choose an existing spoken-audio file, **or** enter a Japanese script and
   explicitly click `生成日语人声` (this calls ElevenLabs and uses credits).
3. Choose local FX audio files, enter start times, adjust volume (initially
   0.1 for ambience / 0.22 for foley), pan and optional ambient looping.
4. Preview over headphones and export a stereo WAV.
5. Make small adjustments to one track at a time and compare A/B.

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
- No KU100 recording or true binaural microphone simulation.
- No time-aligned dialogue-to-Foley cue inference; timestamps are manually set.
- No automatic equalization, mastering or intelligibility scoring.
- No completed single-click export inside the official ChatGPT MCP player.
  Current rendering/export happens on the separate browser preview page.

## Next acceptance test

With one real Japanese voice recording and 1–3 user-selected FX files, check:
(a) human speech remains intelligible, (b) ambience is not too loud,
(c) short action FX does not mask the voice, (d) a left/right pan is audible
on headphones, and (e) mobile Safari playback/export works.
