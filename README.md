# voice-mcp

A platform-neutral Node.js MCP server for ElevenLabs voice generation, expressive delivery and mixed voice + sound-effect playback.

The actively maintained development and deployment branch is `zeabur`, currently at **v1.4.0-beta.50**. It runs as a Node.js 22+ / Express 5 service with Streamable HTTP MCP and is deployed on Zeabur. The same runtime can also run on a VPS or Docker host.



### Multitrack timeline (beta.29)

The MCP tool `render_audio_timeline` accepts a total `duration_sec` and ordered `segments`. Each segment has `type` (`voice`, `foley`, `ambience`, or `gap`), `at_sec`, and `duration_sec`. Voice segments also require `text`; Foley/ambience segments require an uploaded `asset_id`. Voice is synthesized as separate chunks and placed at its timeline offset; effects can play through voice-free sections or after the final voice segment. Gap segments reserve explicit silent intervals. Maximum: 60 seconds, 16 segments total, and 12 effect cues per render. Use `list_sound_assets` to discover private asset IDs. The original `speak` and `speak_with_soundscape` tools remain available.

### Single-card long voice (beta.32)

The MCP tool `speak_long` turns a long passage into **one playable audio item**, rather than returning one ChatGPT audio card per text chunk. It uses the same natural sentence/clause planner, synthesizes each chunk sequentially with the configured ElevenLabs voice/model/settings, passes forward the recent request IDs for continuity, and concatenates the returned 24 kHz mono PCM into one WAV. The MCP inline player receives one short-lived `audio_url`.

- Input: up to 4000 characters; default target chunk size 850 characters; hard chunk limit 1200 characters.
- Output: one WAV / one player card, up to 180 seconds.
- `boundary_pause_ms`: optional 0–500 ms silence inserted between generated chunks; default 60 ms. Set to 0 for direct concatenation or increase slightly if sentence boundaries feel rushed.
- Optional `previous_text` / `next_text`, performance, emotion, language and direction controls follow the same conventions as `speak`.
- This first version is voice-only. It does not yet overlay Foley or ambience; keep using the existing soundscape tools for those workflows.
- If a later chunk fails, the tool reports how many chunks completed; it does not return a partial recording.

The original `speak`, `plan_voice_chunks`, `render_continuous_audio_timeline` and multitrack tools remain available. Use `speak_long` when a single long playback card is preferred; use `plan_voice_chunks` when you explicitly want separate clips for inspection.

### Natural voice chunk planner and alignment QA (beta.31)

The MCP tool `plan_voice_chunks` divides long text at sentence and clause boundaries without making any ElevenLabs requests. Chunk text concatenates exactly to the original input; each chunk includes bounded `previous_text` / `next_text` context and code-point offsets. Generate chunks in order with `speak`, passing the immediately preceding `request_id` through `previous_request_ids`. Context is supplied to the model but is not repeated in spoken audio. Default target is 850 characters and the hard maximum is 1200 characters per chunk.

The continuous timeline response also includes `alignment_audit`, a non-blocking check of provider character alignment completeness and timestamp ordering. This is an alignment-integrity diagnostic, **not ASR**: it cannot prove that every intended word was actually spoken in the rendered waveform. A future ASR-backed check would be a separate opt-in feature.

### Foley action planner and sequential cues (beta.35)

The gated MCP tool `plan_foley_cues` maps an explicitly selected action list to the existing private Foley assets and approved cue levels. Each action requires an exact `after_text` anchor quoted from the spoken text. If punctuation or closing quotation marks immediately follow the anchor, the planner includes them automatically so the cue lands after the complete spoken phrase. It checks that anchors exist and are supplied in spoken-text order, verifies that each matching private asset is present, and returns one fixed asset per action. Supported actions include clothing rustle, package opening, box opening, liquid application, three explicit rhythm variants (basic, crisp and intense), legacy continuous rhythm, bed/object sounds, wet detail, ending detail, and the selected cumshot action.

Planning is deterministic and **does not call ElevenLabs**. It returns ready-to-adapt cue objects for `render_continuous_audio_timeline`, plus `sequence_foley=true` and an optional `tail_duration_sec`. At render time, actual cue positions are resolved from provider character timestamps. Sequential mode trims each Foley cue to end before the next Foley cue begins; if two anchors resolve too close together, rendering fails rather than stacking action sounds. Ambience cues remain independent and may overlap Foley.

### Natural breath repair (beta.37)

The continuous timeline accepts optional `breath_mode`:

- `off` (default) preserves the existing render path.
- `natural` analyzes the generated 24 kHz mono PCM using short-frame RMS and periodicity, then repositions only high-confidence pre-speech inhales by moving surrounding silence. It preserves total duration and speech sample positions.
- This first mode does not insert synthetic breath clips or change voice/Foley gain settings. It makes no additional TTS requests beyond the single synthesis already required by the continuous timeline.
- The response includes `breath_processing` diagnostics (candidate, inhale, exhale and repositioned counts).

The mode remains opt-in until a real listening test confirms that its placement is natural. Breath-pool harvesting and enhanced gap insertion are later phases.

### Voice direction safety (beta.49)

The `direction` field is an optional short English Audio Tag cue, not a hidden/system prompt. It is inserted into the ElevenLabs text inside brackets. Chinese sentences, full natural-language instructions, and instruction-like English sentences are rejected before the ElevenLabs request, so they cannot be accidentally spoken or consume TTS quota. Use `performance` and `emotion` for normal delivery control.

### Enhanced breath repair (beta.48)

The continuous timeline also accepts breath_mode='enhanced'. It reuses the existing conservative breath analyzer, then applies pure-code post-processing to accepted inhale/exhale islands:

- Reduce an existing breath only when it is less than 12 dB below its adjacent speech.
- For inhales, soften abrupt attacks and fade the tail; for exhales, fade the onset into the preceding phrase.
- Reposition only qualifying opening inhales; internal breaths are not moved.
- Preserve total duration and verify that speech samples remain unchanged.

This mode does not generate, insert, or loop new breath clips and makes no additional ElevenLabs requests. The existing 'natural' mode and default 'off' behavior remain unchanged. A separate breath-pool composer will be developed after the approved source clips can be identified and classified.


`render_continuous_audio_timeline` now accepts `tail_duration_sec`, which extends the WAV by that many seconds beyond the actual generated voice duration. This is easier to use than guessing an absolute `timeline_duration_sec` before TTS. The two duration options are mutually exclusive. The cue schema also exposes `source_offset_sec` and `normalization_target_rms` so the planner can preserve the approved excerpts and normalization targets. If voice plus requested tail would exceed the 60-second cap, the tail is shortened to the available remainder and the result reports both requested and applied tail durations.

### Vocal cue catalogue and validation status (beta.39)

The read-only MCP tool `list_vocal_cues` exposes five distinct categories: breathing, spoken delivery, mouth/contact TTS cues, physical-action Foley assets, and ending transitions. Each vocal cue includes its current listening status and recommended use. **Afterglow is an arrangement pattern, not a literal TTS tag.** Listing the catalogue makes no ElevenLabs request. The Foley catalogue exposes action names only; approved gain, pan and fade settings remain internal.

### Vocal cue planner (beta.38)

Practical usage, validated cue roles, line/inline examples, and the Afterglow distinction: [Vocal Cue Playbook](./docs/VOCAL_CUE_PLAYBOOK.md).

`plan_vocal_cues` arranges explicitly selected, reference-derived TTS performance tags around exact text anchors. It is planning-only and makes no ElevenLabs request. It supports line or inline layout, repeated-phrase occurrence selection, and optional user-supplied vocalization text. Tags are candidates until auditioned on the current voice; they are not Foley assets. Use `plan_foley_cues` separately for physical action audio.

### Continuous voice timeline tail (beta.33)

The continuous timeline tool accepts optional `timeline_duration_sec`. By default the final WAV ends with the generated voice, as before. When a longer duration is supplied, Foley or ambience cues may continue after the final spoken sample, creating a deliberate pure-sound tail without another TTS request. Absolute `at_sec` cues can be placed in that tail; every cue must still fit inside the requested timeline. The total duration remains capped at 60 seconds. The mixer already handles voice ducking against the voice envelope, so after speech ends the tail is no longer ducked by nonexistent speech.

This is intentionally a small additive change: existing cue timing, gain, pan, distance, fade-in/fade-out, asset selection and approved sound levels remain unchanged.

### Continuous voice timeline (beta.30)

The MCP tool `render_continuous_audio_timeline` synthesizes the full spoken passage once, requests ElevenLabs character-level timestamps, and overlays Foley/ambience without splitting the voice. Each cue can use either `at_sec` for an absolute offset or `after_text` for an exact spoken phrase; `occurrence` selects a later match when the phrase repeats. This is the preferred mode when speech should remain prosodically continuous. Maximum: 60 seconds and 12 effect cues. Use `list_sound_assets` to discover private asset IDs. Use `tail_duration_sec` for a pure-sound tail after the voice without needing to predict the TTS duration, and `sequence_foley=true` to keep action cues from overlapping.

Use `render_audio_timeline` when you intentionally need separately generated voice sections, voice-free gaps, or effects continuing independently of speech. The two timeline modes are complementary.

## Branches

- `zeabur`: **active maintained branch** for development and current Zeabur deployment; currently v1.4.0-beta.48.
- `voice-v1.4-private-drama`: historical v1.4 beta.7 snapshot. It is not the active deployment branch; do not switch to it without comparing its history against `zeabur`.
- `main`: repository default branch; it may not contain the latest maintained v1.4 work. Do not assume it is the deployment branch.

## Use directly in ChatGPT desktop (Windows)

The maintained `zeabur` branch can also run entirely on your own PC for local testing. No Zeabur, VPS, public tunnel or OAuth is needed for this local-only setup.

1. Clone this branch and install dependencies:
   ```powershell
   git clone --branch zeabur https://github.com/sin047/voice-mcp.git
   cd voice-mcp
   npm install
   Copy-Item .env.example .env
   ```
2. Edit `.env`: add your ElevenLabs API key, keep the configured voice ID, and set a private local token. The example already binds the server to `127.0.0.1` and enables the soundscape tools.
3. Put the curated audio asset bundle's `data/audio-assets` folder into this repository's `data/audio-assets` directory.
4. Start the local server:
   ```powershell
   npm run desktop
   ```
5. In ChatGPT desktop, open **Settings → MCP servers → Add server**, choose **Streamable HTTP**, and enter `http://127.0.0.1:8765/mcp`. Save, then select **Restart**. Type `/mcp` in the composer to confirm the tools are available.

The local configuration uses `HOST=127.0.0.1`, so the unauthenticated MCP endpoint is reachable only from this PC. Do not change it to `0.0.0.0` or expose port 8765 publicly for this no-OAuth test. The private browser preview and asset management routes still use Basic Auth.

## Runtime

Requirements: Node.js 22+.

```bash
npm install
npm start
```

The server listens on `PORT` (default `8080`). The canonical entrypoint is `src/server.mjs`; `src/zeabur-server.mjs` remains only as a backward-compatible import shim.

Docker:

```bash
docker build -t voice-mcp .
docker run --rm -p 8080:8080 \
  -e ELEVENLABS_API_KEY=... \
  -e ELEVENLABS_VOICE_ID=... \
  -e PRIVATE_DRAMA_ACCESS_TOKEN=... \
  -e MCP_PUBLIC_BASE_URL=https://voice.example.com \
  -v voice-mcp-data:/app/data \
  voice-mcp
```

Mount persistent storage at the configured `AUDIO_ASSET_DIR` (default `/app/data/audio-assets` when the working directory is `/app`). Without a persistent volume, uploaded assets are lost when an ephemeral container is replaced.

## MCP tools

The existing `speak` tool remains available. The private asset tools `list_sound_assets` and `speak_with_soundscape` are **disabled by default**. Set `MCP_SOUNDSCAPE_TOOLS_ENABLED=true` only after restricting `/mcp` through private ingress, a firewall/IP allowlist or another verified access layer. The direct-URL connector does not authenticate callers; do not expose private asset IDs through an unrestricted public endpoint.

### `speak_long`

Generate long text as one WAV recording and one inline player item. The server plans sentence-aware chunks, generates them sequentially, chains ElevenLabs request IDs, and joins PCM audio server-side. Up to 4000 characters / 180 seconds; adjustable boundary pause (default 60 ms). Voice-only in beta.32; soundscape overlays are not yet included.

### `speak`

Generate a voice clip with the configured ElevenLabs voice. Supports performance modes (`natural`, `soft`, `close`, `breathy`, `expressive`), language selection, request stitching and an optional `emotion` control. `emotion` maps neutral/calm/curious/tired to subtle B1, warm/tender to the approved inhale-only B2.1 profile, and excited/nervous/intense to experimental inhale-only B3. Omit it to preserve existing behavior; for gradual transitions across adjacent chunks, change the emotion one step at a time and pass the preceding `request_id`. Older MCP clients can use `[emotion:warm]` at the start of `direction` (after any `[soundscape:...]` marker) without changing the MCP connection.

For the already-installed mobile `voice2-v1.3.1` app, soundscapes are backward-compatible through the existing `direction` parameter; no new mobile MCP connection is required. Prefix `direction` with one of these markers:

- `[soundscape:rain]` — quiet looping rain ambience
- `[soundscape:desk]` — keyboard ambience
- `[soundscape:package]` — packaging / unboxing Foley
- `[soundscape:close]` — subtle close-detail Foley
- `[soundscape:intimate]` — legacy multi-cue sequence; retained for comparison, not recommended for new tests
- `[soundscape:clothing]` — one fixed clothing-rub cue, longer excerpt
- `[soundscape:lubricant]` — one fixed application/detail cue, longer excerpt
- `[soundscape:rhythm]` — legacy original continuous-rhythm cue, up to 8 seconds
- `[soundscape:rhythm-basic]`, `[soundscape:rhythm-crisp]`, `[soundscape:rhythm-intense]` — three distinct uploaded rhythm cues, each up to 8 seconds
- `[soundscape:bed]` — one fixed bed/object cue, up to 8 seconds
- `[soundscape:finish]` — legacy ending-detail cue, up to 4 seconds
- `[soundscape:cumshot]` — explicitly selected ending action cue, up to 4 seconds

The new action markers each play exactly one Foley asset per call; they do not stack multiple action sounds. Add `:SECONDS` to any single-action marker for a per-call duration override, e.g. `[soundscape:clothing:10]` or `[soundscape:rhythm-basic:12]` (0.1–60 seconds). The actual excerpt is capped by the source WAV length and generated voice length; it is never looped or time-stretched. Requested duration is capped by the available source audio and the generated voice length, so longer playback requires a sufficiently long uploaded WAV. For natural transitions, end one action before starting the next instead of layering them.

The marker is stripped before the direction reaches ElevenLabs. Omit the marker for the original voice-only MP3 path. Soundscape playback uses a temporary WAV URL and requires the curated assets plus `MCP_PUBLIC_BASE_URL` or Zeabur's injected `ZEABUR_WEB_URL` fallback.

### `plan_foley_cues`\n\nPlan exact-anchor Foley actions from the private sound library. This tool makes no TTS request. It returns fixed approved gain/fade/source-offset settings and cues ready for `render_continuous_audio_timeline`; pass its `tail_duration_sec` and `sequence_foley` values through.\n\n### `list_sound_assets`

List the WAV assets that have been explicitly uploaded to this server's private audio library. Use this tool to retrieve `asset_id` values.

### `speak_with_soundscape`

Generate speech and mix it with up to 12 uploaded ambience/Foley assets. The tool returns a short-lived audio URL which the inline MCP player can play.

- Voice remains centered.
- Mono effects support timing, gain, left/right pan and distance attenuation.
- Stereo effects retain their recorded stereo image.
- Ambience and Foley have independent buses.
- Voice-priority ducking gently lowers effects while speech is present.
- Output is a stereo WAV, limited to 60 seconds.
- The server-side mix uses stereo panning, not browser HRTF.

Generated playback URLs expire after 24 hours and are held in process memory; a server restart or cache eviction can still invalidate a URL. The URL is an unguessable, temporary bearer link.

Audio-producing tools also return a standard MCP `AudioContent` block for outputs up to 4 MiB, so clients that support native MCP audio playback can render audio without depending on an embedded app or an expiring URL. Larger outputs retain the HTTPS URL fallback. The MCP App player remains available on hosts that support MCP Apps and uses native browser audio controls. ChatGPT's custom MCP App interactive UI is currently web-only; the standard audio content block is the mobile/client fallback where supported. No additional environment variable is required for this delivery change.

### Vocal performance presets (beta.40)

The MCP tools `list_vocal_presets` and `plan_vocal_preset` provide reusable, deterministic vocal-performance arrangements. The initial registry includes close-soft, sustained heavy breathing, breathless dialogue, ragged exhale, breathing-to-dialogue, and Afterglow. Preset planning requires exact text anchors and makes zero ElevenLabs calls. Unverified mouth/contact prompts are excluded from automatic presets; Afterglow remains an arrangement pattern with an untagged closing line. To render planner output, pass `rendered_text` to `render_continuous_audio_timeline` with `raw_tags: true`; Foley cues are optional for voice-only rendering. The beta.46 Scene Director composes ordered vocal beats, exact aligned pauses, optional rain/desk ambience and explicit Foley actions into one render request. See the Scene Director guide in docs/SCENE_DIRECTOR.md. See [Vocal Performance Presets](./docs/VOCAL_PERFORMANCE_PRESETS.md).

## Private sound library

1. Configure `PRIVATE_DRAMA_ACCESS_TOKEN` with a random secret of at least 32 characters.
2. Configure `MCP_PUBLIC_BASE_URL` as the public HTTPS origin, for example `https://voice.example.com` (no path).
3. Open `/drama-preview` and complete the browser Basic Auth prompt. Username: `voice-mcp`; password: the access token.
4. Select local sound files. They remain in the browser until you explicitly click **保存到音效库**.
5. The preview converts supported browser audio files to PCM WAV before uploading. The server accepts mono/stereo 16-bit PCM or 32-bit float WAV assets.
6. After restricting `/mcp` access and explicitly enabling `MCP_SOUNDSCAPE_TOOLS_ENABLED=true`, call `list_sound_assets` in ChatGPT to discover asset IDs, then call `speak_with_soundscape`.

The private HTTP token protects `/drama-preview`, `/drama/timeline.mjs`, `/recordings-library`, `/recordings`, `/speak`, `/panel`, `/events/latest` and `/assets`. Open `/recordings-library` in the same browser after completing Basic Auth to manage archived WAV recordings: rename each clip, add up to 12 tags, mark favorites, filter favorites and browse recordings grouped by date. These edits persist in the recording metadata. It does **not** authenticate the MCP `/mcp` endpoint.

## Environment variables

### Voice

| Variable | Default | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | — | Required ElevenLabs API key |
| `ELEVENLABS_VOICE_ID` | — | Default/fallback voice ID |
| `ELEVENLABS_VOICE_ID_ZH` | — | Optional Chinese voice |
| `ELEVENLABS_VOICE_ID_JA` | — | Optional Japanese voice |
| `ELEVENLABS_VOICE_ID_EN` | — | Optional English voice |
| `ELEVENLABS_VOICE_ID_KO` | — | Optional Korean voice |
| `ELEVENLABS_MODEL_ID` | `eleven_v4` | TTS model |
| `ELEVENLABS_OUTPUT_FORMAT` | `mp3_44100_128` | Format for ordinary `speak` playback |
| `BOT_NAME` | `AI` | Player/tool display name |
| `PORT` | `8080` | HTTP listen port |

The soundscape path requests `pcm_24000` internally, then resamples and mixes to 44.1 kHz stereo WAV. This avoids requiring the 44.1 kHz PCM output tier for the mixing path.

### Storage and playback

| Variable | Default | Description |
|---|---:|---|
| `AUDIO_ASSET_DIR` | `./data/audio-assets` | Persistent audio asset directory |
| `AUDIO_ASSET_MAX_BYTES` | 20 MiB | Maximum bytes per uploaded WAV |
| `AUDIO_ASSET_MAX_COUNT` | 100 | Maximum number of stored assets |
| `AUDIO_ASSET_MAX_TOTAL_BYTES` | 200 MiB | Total audio library storage ceiling |
| `MCP_PUBLIC_BASE_URL` | — | Public HTTPS origin for playable soundscape URLs; falls back to Zeabur `ZEABUR_WEB_URL` when available |
| `MCP_SOUNDSCAPE_TOOLS_ENABLED` | `false` | Explicit opt-in for `list_sound_assets` and `speak_with_soundscape`; enable only after `/mcp` access is restricted |

### Request and ElevenLabs usage limits

| Variable | Default | Description |
|---|---:|---|
| `PRIVATE_DRAMA_ACCESS_TOKEN` | — | Required for private HTTP routes; random secret, minimum 32 characters |
| `MCP_MAX_REQUESTS_PER_MINUTE` | 120 | Process-wide HTTP requests to `/mcp` per minute |
| `VOICE_MAX_BILLABLE_CHARS_PER_REQUEST` | 4200 | Maximum final text sent to ElevenLabs per generation |
| `VOICE_MAX_CALLS_PER_MINUTE` | 8 | ElevenLabs attempts per minute |
| `VOICE_MAX_CALLS_PER_DAY` | 120 | ElevenLabs attempts per UTC day |
| `VOICE_MAX_CHARS_PER_DAY` | 12000 | Final text characters sent to ElevenLabs per UTC day |
| `VOICE_MAX_CONCURRENT_SYNTHESIS` | 2 | Concurrent ElevenLabs generations |

The rate and usage counters are process-local, shared across callers on one process, and reset on restart. They are spend/abuse guardrails, not caller identity or durable billing records. Use a shared store such as Redis if the service later runs multiple replicas.

## Security status

OAuth is intentionally deferred while the deployment target is still undecided. The current direct-URL ChatGPT connector remains compatible, so `/mcp` is still unauthenticated. Rate limits reduce accidental spend but do not authenticate the caller. Do not expose this experimental MCP endpoint as a public service until OAuth 2.1 or another verified client/network access strategy is implemented.

Private browser/HTTP routes fail closed if the private access token is missing or weak. Never commit access tokens, ElevenLabs keys or private sound files to GitHub.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /mcp` | Streamable HTTP MCP endpoint |
| `GET /status` | Health and feature status |
| `GET /drama-preview` | Private multitrack audio preview |
| `GET /assets` | Private sound library listing |
| `POST /assets` | Upload one WAV asset |
| `DELETE /assets/:id` | Delete a stored asset |
| `GET /audio/:id` | Short-lived generated soundscape playback |
| `GET /speak`, `POST /speak` | Private direct speech preview |

## Development and tests

```bash
npm test
```

The tests cover performance planning, cue validation, authentication, usage limits, WAV decoding/encoding, audio mixing and persistent asset storage.

## License

MIT. This fork preserves the upstream license from [garan0613/voice-mcp](https://github.com/garan0613/voice-mcp).


## Persistent recording archive

The optional `speak_with_soundscape` parameter `save_recording: true` saves the completed mixed WAV and its metadata to a private persistent recording directory. Saving is opt-in and defaults to false. Configure `RECORDING_DIR` on a persistent volume; see [ZEABUR.md](./ZEABUR.md) for storage limits, private archive endpoints and backup guidance.


The `breathy` performance direction now explicitly requests a quiet inward nasal inhale and rejects an outward huff. The approved B2.1 breath level and voice settings are unchanged; validate the new direction with one controlled listening sample before further tuning.


### Breath Asset Pool (beta.50)

The private audio library now has a distinct `breath` asset kind, separate from Foley and ambience. Clips are 0.22–1.1 seconds and explicitly classified as inhale or exhale. Extracted clips are always saved as `pending`; they must be previewed and manually approved before the composer can use them.

New read-only/archive tools:

- `list_recordings` searches saved recordings by title, spoken text, tags, and favorite state.
- `extract_breath_asset` crops a selected range from a saved recording without changing the original.
- `preview_breath_asset`, `list_breath_assets`, and `set_breath_asset_status` support listening and explicit approval.

The continuous timeline accepts `breath_pool_mode="conservative"` separately from `breath_mode`. It inserts only approved clips into silent inter-phrase gaps of at least 0.75 seconds, uses phrase-relative loudness, applies short type-specific fades, and inserts at most two clips per passage. It never loops or time-stretches clips and preserves speech samples and total duration. The pool is opt-in and disabled by default.
