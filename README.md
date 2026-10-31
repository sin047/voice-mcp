# voice-mcp

A platform-neutral Node.js MCP server for ElevenLabs voice generation, expressive delivery and mixed voice + sound-effect playback.

The actively maintained development and deployment branch is `zeabur`, currently at **v1.4.0-beta.32**. It runs as a Node.js 22+ / Express 5 service with Streamable HTTP MCP and is deployed on Zeabur. The same runtime can also run on a VPS or Docker host.



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

### Continuous voice timeline (beta.30)

The MCP tool `render_continuous_audio_timeline` synthesizes the full spoken passage once, requests ElevenLabs character-level timestamps, and overlays Foley/ambience without splitting the voice. Each cue can use either `at_sec` for an absolute offset or `after_text` for an exact spoken phrase; `occurrence` selects a later match when the phrase repeats. This is the preferred mode when speech should remain prosodically continuous. Maximum: 60 seconds and 12 effect cues. Use `list_sound_assets` to discover private asset IDs.

Use `render_audio_timeline` when you intentionally need separately generated voice sections, voice-free gaps, or effects continuing independently of speech. The two timeline modes are complementary.

## Branches

- `zeabur`: **active maintained branch** for development and current Zeabur deployment; currently v1.4.0-beta.32.
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
- `[soundscape:rhythm]` — one fixed continuous-rhythm cue, up to 8 seconds
- `[soundscape:bed]` — one fixed bed/object cue, up to 8 seconds
- `[soundscape:finish]` — one fixed ending-detail cue, up to 4 seconds

The new action markers each play exactly one Foley asset per call; they do not stack multiple action sounds. Add `:SECONDS` to any single-action marker for a per-call duration override, e.g. `[soundscape:clothing:10]` or `[soundscape:rhythm:12]` (0.1–60 seconds). The actual excerpt is capped by the source WAV length and generated voice length; it is never looped or time-stretched. Requested duration is capped by the available source audio and the generated voice length, so longer playback requires a sufficiently long uploaded WAV. For natural transitions, end one action before starting the next instead of layering them.

The marker is stripped before the direction reaches ElevenLabs. Omit the marker for the original voice-only MP3 path. Soundscape playback uses a temporary WAV URL and requires the curated assets plus `MCP_PUBLIC_BASE_URL` or Zeabur's injected `ZEABUR_WEB_URL` fallback.

### `list_sound_assets`

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

The generated playback URL expires after 10 minutes and is held in process memory; a server restart invalidates it. The URL is an unguessable, temporary bearer link.

Both `speak` and `speak_with_soundscape` attach the same MCP App audio player. Voice-only output is passed as an audio data URL; mixed soundscape output is loaded from its short-lived HTTPS playback URL. The player uses the current MCP Apps `ui/initialize` handshake (`2026-01-26`) and native browser audio controls. Hosts without MCP Apps still receive the normal text/structured tool result. After changing MCP tool UI metadata, refresh the custom MCP app in ChatGPT so the host re-reads the tool definitions.

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
