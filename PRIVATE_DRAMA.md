# Shin · Private Drama Lab (v1.4.0-beta.6)

This is an **experimental**, independent preview of multitrack voice / sound-effect mixing.
It lives on the `voice-v1.4-private-drama` branch. **Do not replace the stable
`zeabur` deployment until you have tested the mix and access protections.**

## Confirmed listening direction

The selected target is **immersive foreground voice + headphone spatial depth + independent sound effects**.

1. **Voice stays in front.** Keep the established ElevenLabs Japanese voice as the emotional and intelligibility anchor. Do not force breath tags or dramatic intensity into ordinary lines.
2. **Spatial depth supports the voice.** The beta offers an explicit spatial mode: basic stereo panning, or browser HRTF positioning for mono effects. HRTF is headphone-oriented playback spatialization, not a binaural microphone recording.
3. **Effects are real, separate tracks.** Ambience and Foley/action cues remain independently adjustable. Effects should enrich a scene without masking speech.

### Current mix architecture

- **Voice path:** centered by default, foreground level, no automatic widening.
- **Ambience bus:** independent level, optional loop and long fades; voice RMS ducking is applied more deeply to this bus.
- **Foley bus:** independent level, discrete event cues with manual start time, gain, pan/position and short fades; ducking is gentler than on ambience.
- **Master path:** conservative dynamics compression and offline WAV peak protection.
- **Spatial path:** mono effects can use the browser's HRTF PannerNode mode with independent left/right position and a 0.5–8 m distance control using inverse distance attenuation; stereo source files retain their stereo image and use basic stereo panning.
- **Ducking:** a precomputed short-window voice RMS envelope gently lowers effects while voice energy is present, then releases during pauses. It is not semantic speech detection or a hardware sidechain compressor.

### Delivery phases

- **Beta / current:** local voice + local effects, manual cue timing, ambience/Foley types, independent bus levels, per-cue gain/pan/fades, ambient looping, optional HRTF for mono effects, voice-priority ducking, stereo preview and local WAV export.
- **Current beta:** private WAV asset library, server-side stereo mixer and MCP tools `list_sound_assets` / `speak_with_soundscape`; the latter returns a short-lived playable audio URL for the inline MCP player.
- **Next audio pass:** validate the new end-to-end asset upload → MCP tool → audio player flow on a real ChatGPT connection; refine ducking and spatial balance using headphone A/B tests.

## What exists today

- `/drama-preview`: a mobile-friendly browser prototype for a Japanese voice
  track and up to 12 independent local effects.
- `/drama/timeline.mjs`: a declarative cue-sheet planner with validated start
  times, effect kind (ambience / foley), gain, pan, fades and ambient looping.
- Separate ambience and Foley mix buses with independent bus gain controls.
- Voice-priority ducking: a short-window RMS envelope from the voice track gently lowers the effects buses while speech energy is present, then releases gradually during pauses.
- Optional browser HRTF positioning for mono effects, with per-cue 0.5–8 m distance and left/right position; stereo source files retain their original stereo image and use basic stereo panning.
- Local preview with conservative master compression and offline WAV peak protection.
- Opt-in Japanese voice generation via `POST /speak`, using the existing
  ElevenLabs voice ID and restrained/close direction.
- Private WAV asset library with explicit upload from the preview page; browser-selected MP3/M4A files are decoded and converted to PCM WAV before upload.
- MCP `list_sound_assets` tool for discovering stored `asset_id` values.
- MCP `speak_with_soundscape` tool: generate voice in 24 kHz PCM, resample and mix up to 12 stored effects into a stereo WAV, then return a 10-minute short-lived playback URL.
- Private asset management endpoints: `GET/POST /assets`, `DELETE /assets/:id`.
- Regression coverage for WAV parsing, asset storage, mixing, access controls and usage limits.

The normal `speak` MCP tool is **unchanged** in this branch.

## Platform-neutral runtime

The canonical entrypoint is `src/server.mjs` and `npm start` uses it. The old
`src/zeabur-server.mjs` path is a compatibility shim only. No Zeabur-specific
SDK or API is used by the experimental runtime. Configure storage with a
filesystem path and mount persistent storage when running in an ephemeral
container.

## Private HTTP access

The experimental browser and direct HTTP routes are protected by
`PRIVATE_DRAMA_ACCESS_TOKEN`:

- `/drama-preview` and `/drama/timeline.mjs`
- `/speak` (GET and POST), including preview TTS generation
- `/panel` and `/events/latest`
- `/assets` and `/assets/:id`, including uploads and deletion

The server fails closed: if the token is missing or shorter than 32 characters,
these routes return HTTP 503. Missing or incorrect credentials return HTTP 401.
Authentication runs before JSON body parsing on protected routes.

1. Generate a random secret with `openssl rand -hex 32`.
2. Add it as the `PRIVATE_DRAMA_ACCESS_TOKEN` environment secret on the TEST
   deployment. Never commit the token to GitHub or put it in browser code.
3. Open the preview URL. The browser's Basic Auth prompt accepts username
   `voice-mcp` and the generated token as the password.
4. For scripts, send `Authorization: Bearer <token>`.

The `AUDIO_ASSET_DIR` path defaults to `./data/audio-assets`. Mount this
directory to persistent disk when using a replaceable container. The asset
library accepts mono/stereo 16-bit PCM or 32-bit float WAV files, up to the
configured size/count/storage limits.

**Important boundary:** the `/mcp` endpoint intentionally keeps the existing
ChatGPT connector behavior and is not protected by this HTTP preview token.
The MCP `speak` tool can therefore still generate audio if the MCP endpoint is
publicly reachable. Before public deployment, add authentication compatible
with the configured ChatGPT connector, or restrict ingress to a private
network, and add rate limits/quotas. Do not mistake this preview gate for
complete server-wide protection.

## Private audio asset library and MCP soundscape tools

The preview remains local-first. Selecting a local file does not upload it.
Each effect track has an explicit **保存到音效库** action. Only after that click
does the browser decode the selected file and upload a WAV representation to
the authenticated `POST /assets` route. The asset is stored under
`AUDIO_ASSET_DIR`, outside the Git repository.

Use the new MCP tools in this order:

1. Open `/drama-preview`, select one or more sound-effect files and click
   **保存到音效库** for each one.
2. Call `list_sound_assets` in ChatGPT. It returns the stored asset IDs, names,
   duration, channel count and library usage.
3. Call `speak_with_soundscape` with the spoken text and 1–12 cues referencing
   those asset IDs. Each cue can choose `ambience` or `foley`, start time,
   gain, left/right pan, distance, fades, duration and optional ambience loop.
4. The server synthesizes voice using ElevenLabs `pcm_24000`, resamples to
   44.1 kHz, mixes voice and effects, then stores a temporary stereo WAV.
5. The MCP inline player receives a short-lived `audio_url`. Generated audio
   is kept in memory for 10 minutes; restarting the server invalidates the URL.

The server-side MCP mix supports stereo panning and distance attenuation. It
does **not** apply browser HRTF. Browser HRTF remains available in the local
preview for headphone listening. The soundscape output is limited to 60 seconds
and uses at most 12 cues.

`MCP_PUBLIC_BASE_URL` must be configured as the public HTTPS origin (no path)
so the MCP tool can return a playable URL. This setting is provider-neutral.

## MCP request and ElevenLabs usage guardrails

The direct-URL ChatGPT MCP connection remains **unauthenticated** for now.
To reduce accidental or abusive spend without changing the current connector,
the experimental server applies these process-wide limits:

| Environment variable | Default | Meaning |
|---|---:|---|
| `MCP_MAX_REQUESTS_PER_MINUTE` | 120 | All HTTP requests to `/mcp` per running process per minute |
| `VOICE_MAX_BILLABLE_CHARS_PER_REQUEST` | 4200 | Maximum final text sent to ElevenLabs in one request |
| `VOICE_MAX_CALLS_PER_MINUTE` | 8 | ElevenLabs generation attempts per minute |
| `VOICE_MAX_CALLS_PER_DAY` | 120 | ElevenLabs generation attempts per UTC day |
| `VOICE_MAX_CHARS_PER_DAY` | 12000 | Final text characters sent to ElevenLabs per UTC day |
| `VOICE_MAX_CONCURRENT_SYNTHESIS` | 2 | Simultaneous ElevenLabs generation requests |

The MCP `speak` tool also validates its input at 1–4000 characters. The same
ElevenLabs quota guard covers both MCP `speak` and the protected HTTP
`/speak` preview routes. A reservation is recorded before the upstream call;
failed upstream attempts still count, and the concurrency slot is always
released. HTTP callers receive 429 plus `Retry-After` when a quota is reached.

**Limitations:** counters are held in process memory, shared across all callers
of this one process, and reset when the process restarts. They are not per-user
identity, not durable accounting, and not shared across multiple replicas.
This is a useful single-instance spend ceiling, not a substitute for OAuth or
network-level access control. Use a shared store such as Redis for a
multi-instance deployment.

## Using the preview after deploying a separate TEST instance

1. Set `PRIVATE_DRAMA_ACCESS_TOKEN` on the TEST deployment, then open
   `https://<your-test-host>/drama-preview` in Chrome, Edge or Safari and enter
   the Basic Auth credentials described above.
2. Choose an existing spoken-audio file, **or** enter a Japanese script and
   explicitly click `生成日语人声` (this calls ElevenLabs and uses credits).
3. Choose local FX audio files, enter start times, adjust per-cue volume
   (initially 0.1 for ambience / 0.22 for Foley), pan and optional ambient looping.
4. Set ambience/Foley bus levels, master level, voice-priority ducking and
   spatial mode. In HRTF mode, each mono FX cue can be positioned left/right
   and at 0.5–8 m; stereo FX keep their recorded stereo image.
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

**Avoid committing private recordings or licensed sound effects to this public
repository.** Uploaded assets are stored only in the configured server data
directory; they are not added to Git. Keep track of each recording's source,
license and allowed uses. Files remain local until you explicitly click
**保存到音效库**.

**Important production blocker:** browser/HTTP routes now have a fail-closed
access-token gate. The MCP `/mcp` endpoint remains unauthenticated for direct-URL
connector compatibility; it has process-local request and ElevenLabs usage
limits, but those do not identify or authorize the caller. Add OAuth 2.1 or
verified ChatGPT client transport identity (mTLS / published egress IP allowlist)
before treating the endpoint as a public service.

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
- No in-player multitrack editor or WAV export inside the official ChatGPT MCP
  player. The MCP tool returns a finished, short-lived playable mix; editing
  cues and uploading assets still happens in the separate browser preview.

## Next acceptance test

Use one Japanese voice clip and 1–3 locally selected, properly licensed FX clips.
The user has supplied a small WAV trial pack for local technical testing; do not
commit those files or redistribute them. Check:

(a) speech stays clearly in front, (b) ambience remains subtle,
(c) short Foley cues do not mask consonants or line endings,
(d) voice-priority ducking is gentle and does not audibly pump,
(e) HRTF near/mid/far placement on mono effects is clearly differentiated but not distracting,
(f) stereo source material is preserved sensibly,
(g) mobile Safari playback/export works,
(h) only explicitly saved effects are uploaded,
(i) `list_sound_assets` returns the expected asset IDs, and
(j) `speak_with_soundscape` returns a playable audio URL in the ChatGPT inline player.

Use the results to tune the existing HRTF and ducking implementation. Do not describe the feature as production-ready until headphone A/B testing passes on both mobile Safari and desktop browsers.
